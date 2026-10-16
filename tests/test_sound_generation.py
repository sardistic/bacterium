import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

SPEC = importlib.util.spec_from_file_location('sound_generation', Path(__file__).resolve().parents[1] / 'scripts/generate-soundscape.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

class Response:
    headers = {'Content-Type': 'audio/mpeg'}
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def read(self): return b'test-audio' * 300

class SoundGenerationTests(unittest.TestCase):
    def test_brief_default_never_calls_provider(self):
        with patch('sys.argv', ['generator']), patch.object(MODULE.urllib.request, 'urlopen') as request, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(MODULE.main(), 0)
            request.assert_not_called()

    def test_missing_key_never_calls_provider(self):
        with patch('sys.argv', ['generator', '--generate']), patch.dict(os.environ, {'ELEVENLABS_API_KEY': ''}), patch.object(MODULE.urllib.request, 'urlopen') as request, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(MODULE.main(), 1)
            request.assert_not_called()

    def test_complete_set_writes_local_hashed_assets_without_key(self):
        with tempfile.TemporaryDirectory() as directory:
            captured = []
            def provider(request, timeout):
                captured.append(request)
                payload = json.loads(request.data)
                self.assertTrue(payload['loop'])
                self.assertEqual(payload['model_id'], 'eleven_text_to_sound_v2')
                self.assertEqual(request.full_url, 'https://api.elevenlabs.io/v1/sound-generation')
                self.assertEqual(request.get_header('Xi-api-key'), 'fixture-key')
                return Response()
            with patch.object(MODULE, '__file__', str(Path(directory) / 'scripts/generator.py')), patch('sys.argv', ['generator', '--generate']), patch.dict(os.environ, {'ELEVENLABS_API_KEY': 'fixture-key'}), patch.object(MODULE.urllib.request, 'urlopen', provider), contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(MODULE.main(), 0)
            self.assertEqual(len(captured), 3)
            destination = Path(directory) / 'dist/assets/audio'
            manifest = json.loads((destination / 'manifest.json').read_text())
            self.assertEqual(manifest['provider'], 'elevenlabs')
            self.assertEqual(set(manifest['layers']), {'fluid', 'motor', 'membrane'})
            for path in manifest['layers'].values(): self.assertTrue((destination / Path(path).name).is_file())
            self.assertNotIn('fixture-key', output.getvalue())
            self.assertNotIn('fixture-key', (destination / 'manifest.json').read_text())

    def test_partial_provider_failure_preserves_previous_set(self):
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / 'dist/assets/audio'
            destination.mkdir(parents=True)
            previous = '{"provider":"procedural","layers":{}}'
            (destination / 'manifest.json').write_text(previous)
            failure = HTTPError('https://api.elevenlabs.io/v1/sound-generation', 429, 'Rate limited', {}, None)
            with patch.object(MODULE, '__file__', str(Path(directory) / 'scripts/generator.py')), patch('sys.argv', ['generator', '--generate']), patch.dict(os.environ, {'ELEVENLABS_API_KEY': 'fixture-key'}), patch.object(MODULE.urllib.request, 'urlopen', side_effect=[Response(), failure]), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(MODULE.main(), 1)
            self.assertEqual((destination / 'manifest.json').read_text(), previous)
            self.assertEqual(len(list(destination.iterdir())), 1)

if __name__ == '__main__': unittest.main()
