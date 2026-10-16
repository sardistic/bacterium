"""Generate three loopable ElevenLabs SFX stems for the existing local mixer.

Default prints the sound brief without spending credits. --generate requires
ELEVENLABS_API_KEY in the process environment and makes three paid API calls.
The key stays in memory. Generated MP3s and a manifest replace procedural audio
on the next Site publication; no API key or provider request reaches visitors.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import tempfile
import urllib.request
import urllib.error

BRIEFS = {
    'fluid': {'duration_seconds': 15, 'text': 'Seamless quiet underwater microscopic ambience, deep soft aqueous room tone with gently shifting porous fluid texture. Intimate, muted and low frequency. No speech, music, melody, sharp clicks, dramatic swells, or bright sparkling sounds. Isolated ambient stem.'},
    'motor': {'duration_seconds': 12, 'text': 'Seamless soft organic rotary mechanism immersed in liquid, low damp granular friction, uneven tiny rubbery murmurs, gentle continuous turning with delicate muffled wet ticks. Very restrained, close and tactile. No metal engine, beat, music, speech, or harsh transients. Isolated stem.'},
    'membrane': {'duration_seconds': 12, 'text': 'Seamless extremely soft porous membrane movement underwater, irregular tiny aqueous contacts, muffled fluid granules and faint flexible protein-like rubbing. Diffuse, intimate, subdued, unhurried. No sharp bubbles, clicks, chimes, speech, music or dramatic changes. Isolated stem.'},
}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--generate', action='store_true', help='Generate the three stems using the configured ElevenLabs account (uses credits).')
    args = parser.parse_args()
    if not args.generate:
        print(json.dumps(BRIEFS, indent=2))
        return 0
    key = os.environ.get('ELEVENLABS_API_KEY', '').strip()
    if not key:
        print('ELEVENLABS_API_KEY is not configured in this process environment. No requests were made.')
        return 1
    destination = Path(__file__).resolve().parents[1] / 'dist/assets/audio'
    with tempfile.TemporaryDirectory(prefix='micro-audio-') as staging:
        for name, brief in BRIEFS.items():
            payload = {**brief, 'model_id': 'eleven_text_to_sound_v2', 'loop': True, 'prompt_influence': .5}
            request = urllib.request.Request('https://api.elevenlabs.io/v1/sound-generation', data=json.dumps(payload).encode(), headers={'xi-api-key': key, 'Content-Type': 'application/json'}, method='POST')
            try:
                with urllib.request.urlopen(request, timeout=180) as response:
                    audio = response.read()
                    if 'audio' not in response.headers.get('Content-Type', '') or len(audio) < 1000:
                        raise ValueError('Provider did not return an audio file.')
            except urllib.error.HTTPError as error:
                print(f'ElevenLabs returned HTTP {error.code} for {name}. Existing audio was preserved. No credential or response body was logged.')
                return 1
            except (OSError, ValueError):
                print(f'Could not generate {name}. Existing audio was preserved.')
                return 1
            (Path(staging) / f'{name}.mp3').write_bytes(audio)
        destination.mkdir(parents=True, exist_ok=True)
        layers = {}
        for name in BRIEFS:
            audio = (Path(staging) / f'{name}.mp3').read_bytes()
            filename = f'{name}-{hashlib.sha256(audio).hexdigest()[:12]}.mp3'
            temporary = destination / f'{filename}.tmp'
            temporary.write_bytes(audio)
            temporary.replace(destination / filename)
            layers[name] = f'./assets/audio/{filename}'
        manifest = {'provider': 'elevenlabs', 'model': 'eleven_text_to_sound_v2', 'layers': layers}
        temporary = destination / 'manifest.json.tmp'
        temporary.write_text(json.dumps(manifest, indent=2)+'\n')
        temporary.replace(destination / 'manifest.json')
    print('Generated all three local stems and updated the audio manifest. Validate playback, then publish the same Site.')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
