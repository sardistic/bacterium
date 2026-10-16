// Interpretive, quiet sound design. Audio starts only after a user gesture.
export class MolecularSoundscape {
  constructor(){
    this.enabled=false;this.volume=.25;this.context=null;this.pending=null;this.lastEvent=-1;
    this.metrics={enabled:false,provider:'procedural',running:false,near:0,motorWeight:0,cutoff:0,master:0};
    this.targets=new WeakMap();
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.master)this.target(this.master.gain,0,.06);});
  }
  target(parameter,value,fade=.12){if(Math.abs((this.targets.get(parameter)??Infinity)-value)<.003)return;this.targets.set(parameter,value);parameter.setTargetAtTime(value,this.context.currentTime,fade);}
  async setEnabled(value){
    this.enabled=value;
    if(!value){if(this.master)this.target(this.master.gain,0,.04);this.metrics.enabled=false;return;}
    try{
      if(!this.context){const Context=window.AudioContext||window.webkitAudioContext;if(!Context)throw new Error('This browser does not support audio.');this.context=new Context();}
      // Resume synchronously from the click, before awaiting asset loading.
      const resume=this.context.resume();
      if(!this.pending)this.pending=this.initialize();
      await Promise.all([resume,this.pending]);this.metrics.enabled=this.enabled;
    }catch(error){this.enabled=false;this.metrics.enabled=false;this.pending=null;if(this.master)this.target(this.master.gain,0,.04);throw error;}
  }
  async initialize(){
    if(this.layers)return;
    const ctx=this.context;
    this.master=ctx.createGain();this.master.gain.value=0;
    const compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-22;compressor.knee.value=15;compressor.ratio.value=4;compressor.attack.value=.02;compressor.release.value=.3;
    this.analyser=ctx.createAnalyser();this.analyser.fftSize=1024;this.master.connect(compressor).connect(this.analyser).connect(ctx.destination);
    this.samples=new Float32Array(this.analyser.fftSize);
    let buffers=null;
    try{
      const response=await fetch('./assets/audio/manifest.json',{cache:'no-cache'});
      if(response.ok){const manifest=await response.json();if(manifest.provider==='elevenlabs'&&['fluid','motor','membrane'].every(id=>manifest.layers?.[id])){
        const entries=await Promise.all(['fluid','motor','membrane'].map(async id=>{
          const url=new URL(manifest.layers[id],location.href);
          if(url.origin!==location.origin||!url.pathname.includes('/assets/audio/'))throw new Error('Invalid local audio asset.');
          const audio=await fetch(url);if(!audio.ok)throw new Error('Audio asset missing.');
          const buffer=await ctx.decodeAudioData(await audio.arrayBuffer());
          let power=0,peak=0,count=0;
          for(let channel=0;channel<buffer.numberOfChannels;channel++){const data=buffer.getChannelData(channel);for(const value of data){power+=value*value;peak=Math.max(peak,Math.abs(value));count++;}}
          const rms=Math.sqrt(power/Math.max(count,1));if(rms<.00001)throw new Error('Audio stem is silent.');
          const level=Math.min(.10/rms,.8/Math.max(peak,.001),2);
          for(let channel=0;channel<buffer.numberOfChannels;channel++){const data=buffer.getChannelData(channel);for(let i=0;i<data.length;i++)data[i]*=level;}
          return [id,buffer];
        }));buffers=Object.fromEntries(entries);this.metrics.provider='elevenlabs';
      }}
    }catch{ /* A missing or incomplete replacement set retains the local preview. */ }
    this.layers={};
    for(const [index,id] of ['fluid','motor','membrane'].entries()){
      const source=ctx.createBufferSource();source.buffer=buffers?.[id]??this.makeBuffer(index);source.loop=true;
      const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=400;filter.Q.value=.35;
      const highpass=ctx.createBiquadFilter();highpass.type='highpass';highpass.frequency.value=35;
      const gain=ctx.createGain();gain.gain.value=0;const pan=ctx.createStereoPanner();pan.pan.value=0;
      source.connect(highpass).connect(filter).connect(gain).connect(pan).connect(this.master);source.start();
      this.layers[id]={source,filter,gain,pan};
    }
    this.contact=this.makeBuffer(2,.22);
  }
  makeBuffer(kind,seconds=9){
    const rate=this.context.sampleRate,n=Math.floor(seconds*rate),overlap=Math.min(Math.floor(rate*.15),Math.floor(n/4));
    let seed=7523+kind*117,brown=0,soft=0;
    const raw=new Float32Array(n+overlap);
    for(let i=0;i<raw.length;i++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/2147483648-1,t=i/rate;
      brown=(brown+noise*.05)/1.018;soft+=.09*(noise-soft);
      if(kind===0)raw[i]=brown*.9+soft*.06;
      else if(kind===1)raw[i]=Math.sin(t*Math.PI*2*67+.23*Math.sin(t*13))*.14*(.7+.3*Math.sin(t*37))+brown*.28+soft*.05;
      else raw[i]=soft*.45*(.5+.5*Math.sin(t*17+Math.sin(t*3)))+brown*.16;
    }
    const buffer=this.context.createBuffer(1,n,rate),data=buffer.getChannelData(0);
    for(let i=0;i<n;i++){const w=Math.min(i/overlap,1);data[i]=i<overlap?raw[n+i]*(1-w)+raw[i]*w:raw[i];}
    return buffer;
  }
  update({distance,motorDistance,motorPan,proteinDistance,paused,hidden,speed,direction,motorVisible,proteinsVisible,particlesVisible,time}){
    if(!this.layers)return;
    const near=Math.max(0,Math.min(1,(34-distance)/27));
    const motorNear=Math.exp(-Math.pow(motorDistance/18,2));
    const proteinNear=Math.exp(-Math.pow(proteinDistance/26,2));
    const audible=this.enabled&&!paused&&!hidden;
    const master=audible?this.volume*.65:0;
    this.target(this.master.gain,master,.09);
    this.target(this.layers.fluid.gain.gain,.19+near*.20);
    this.target(this.layers.fluid.filter.frequency,270+near*250);
    this.target(this.layers.motor.gain.gain,motorVisible?motorNear*(.25+near*.45):0);
    this.target(this.layers.motor.filter.frequency,320+near*1250);
    this.target(this.layers.motor.pan.pan,Math.max(-.8,Math.min(.8,motorPan)));
    this.target(this.layers.motor.source.playbackRate,Math.max(.55,Math.min(1.5,.8+speed*.17+(direction<0?.025:0))));
    this.target(this.layers.membrane.gain.gain,proteinsVisible?(.12+near*.35)*proteinNear:0);
    this.target(this.layers.membrane.filter.frequency,350+near*1500);
    const event=Math.floor(time*1.6);
    if(audible&&particlesVisible&&near>.2&&this.lastEvent>=0&&event!==this.lastEvent)this.playContact(near,motorPan);
    this.lastEvent=event;
    Object.assign(this.metrics,{enabled:this.enabled,running:this.context.state==='running',near,motorWeight:motorVisible?motorNear*(.25+near*.45):0,cutoff:320+near*1250,master});
  }
  playContact(near,panValue){
    const ctx=this.context,now=ctx.currentTime,source=ctx.createBufferSource();source.buffer=this.contact;source.playbackRate.value=.7+near*.35;
    const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=600+near*450;
    const gain=ctx.createGain();gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.08*near,now+.025);gain.gain.exponentialRampToValueAtTime(.0001,now+.20);
    const pan=ctx.createStereoPanner();pan.pan.value=Math.max(-.8,Math.min(.8,panValue));
    source.connect(filter).connect(gain).connect(pan).connect(this.master);source.start();source.stop(now+.23);
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();pan.disconnect();};
  }
  rms(){if(!this.analyser)return 0;this.analyser.getFloatTimeDomainData(this.samples);return Math.sqrt(this.samples.reduce((sum,v)=>sum+v*v,0)/this.samples.length);}
}
