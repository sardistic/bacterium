import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { MolecularSoundscape } from './soundscape.js?v=4';
import { ENTRIES, CITES, GROUPS, FACTS } from './annotations.js?v=10';
import { MinSim, ChemotaxisSim } from './sim.js?v=10';

const $ = id => document.getElementById(id);
const state = { paused: matchMedia('(prefers-reduced-motion: reduce)').matches, speed: 1, direction: 1, time: 0, cut: 65, ao: true, labels: true, view: 'motor', quality: 'balanced', tour: false, selected: null, autoSwitch: true, adaptive: true };
const metrics = { ready: false, frames: 0, sphereCount: 0, drawCalls: 0, fps: 0, shaderErrors: [] };
window.__micro = { state, metrics };

function fail(error) { console.error(error); $('loading').classList.add('hidden'); $('error').hidden = false; $('error-message').textContent = error.message || String(error); }
try { await start(); } catch (error) { fail(error); }

async function start() {
  const response=await fetch('./assets/molecules.json');
  if(!response.ok)throw new Error('The molecular shape library could not load. Please reload.');
  const templates=await response.json();
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.debug.onShaderError = (gl, program, vs, fs) => { const message = gl.getProgramInfoLog(program) + gl.getShaderInfoLog(vs) + gl.getShaderInfoLog(fs); metrics.shaderErrors.push(message); fail(new Error('A graphics shader could not compile. ' + message)); };
  $('viewport').append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#020407');
  const camera = new THREE.PerspectiveCamera(40, 1, .1, 1600);
  camera.up.set(-.27,.963,0);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = .065; controls.minDistance = 6; controls.maxDistance = 900;
  controls.maxPolarAngle = Math.PI * .86; controls.target.set(1, 1.5, 0);
  scene.add(new THREE.HemisphereLight('#d9efde', '#162b38', 2));
  const key = new THREE.DirectionalLight('#fff2c9', 3); key.position.set(-8, 15, 15); scene.add(key);
  const fill = new THREE.DirectionalLight('#8bc7dc', 1); fill.position.set(12, 0, -6); scene.add(fill);
  const proteins = new THREE.Group(), envelope = new THREE.Group(), motor = new THREE.Group(), particles = new THREE.Group(), suspension=new THREE.Group();
  scene.add(proteins, envelope, motor, particles,suspension);
  const sound=new MolecularSoundscape();window.__micro.sound=sound;
  const cutUniform = { value: 2.1 }, timeUniform = { value: 0 },heightUniform={value:innerHeight},rotorUniform={value:0},shutterUniform={value:0},tumbleUniform={value:0},fogUniform={value:new THREE.Vector2(24,64)};
  // Live models: Brownian dynamics for whole-cell molecules (rows 0-254 of a float texture), the Min profile (row 255).
  const minSim=new MinSim(),chemo=new ChemotaxisSim(),minData=new Float32Array(128*4);
  const simTexture=new THREE.DataTexture(minData,128,1,THREE.RGBAFormat,THREE.FloatType);simTexture.minFilter=simTexture.magFilter=THREE.NearestFilter;simTexture.needsUpdate=true;
  const simUniform={value:simTexture};
  const pickUniform={value:0},bufferHeightUniform={value:1};
  window.__micro.sims={minSim,chemo};
  const materials = [], animated = [], beadMeshes = [];
  let seed = 8711;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const range = (a,b) => a + random() * (b-a);
  const palette = ['#51c8d6','#8cdee0','#42bacb','#5acbd3','#51b5d2','#83c9ed','#9bbbf2','#7fb0ec','#76d4c6','#b1a7ef','#ed95d6','#f2b5de','#c57dd3'];
  const colorCache = new Map();
  const rgb = c => { if (!colorCache.has(c)) colorCache.set(c, new THREE.Color(c)); return colorCache.get(c); };
  const organicField=`
    vec3 organicShape(vec3 p,float tm){
      float r=length(p.xz),a=atan(p.z,p.x);
      float drum=(1.-smoothstep(-.25,.15,p.y))*smoothstep(-2.3,-1.7,p.y);
      float shaft=(1.-smoothstep(.3,.55,r))*smoothstep(-1.,0.,p.y)*(1.-smoothstep(5.7,6.2,p.y));
      float collar=smoothstep(.75,1.,r)*(1.-smoothstep(1.6,1.9,r))*smoothstep(1.5,2.,p.y);
      float radial=drum*(.055*sin(a*17.+p.y*4.)+.045*sin(a*7.-p.y*5.)+.017*sin(tm*2.+a*11.));
      radial+=shaft*.018*sin(p.y*8.+a*5.+tm*1.4)+collar*(.035*sin(a*13.+p.y*5.)+.021*sin(a*21.-p.y));
      p.xz*=1.+radial/max(r,.05);
      p.y+=drum*(.03*sin(a*9.)+.012*sin(tm*2.+a*5.))+collar*.025*sin(a*11.);
      p.x+=shaft*.018*sin(p.y*6.+tm);
      return p;
    }
    float surfY(vec2 q,float b){return -35.+sqrt((35.+b)*(35.+b)-dot(q,q));}
    float pinch(float y){return 3.5*exp(-pow((y+105.)/7.,2.));}
    // Slow bilayer undulation shared by lipids, porins, LPS, embedded machines and the membrane sheets; it fades out around the motor so the bushings stay seated.
    float memWave(vec2 q,float t){
      return (.075*sin(q.x*.42+t*.55)*cos(q.y*.57-t*.37)+.04*sin(q.x*1.07-q.y*.71+t*.83))*smoothstep(2.4,4.6,length(q-vec2(2.1,.1)));
    }
    // Messenger RNA path through a polysome (mirrored in JS to seat the ribosomes on it).
    vec3 polysomePath(vec3 o,vec3 d,float u){
      vec3 perp=normalize(cross(d,vec3(0.,1.,0.)));
      return o+d*u+perp*sin(u*.9+o.x)*.5+vec3(0.,.35*sin(u*.6+o.z),0.);
    }`;
  const beadVertex = `
    attribute vec3 aCenter, aOffset, aColor;
    attribute float aRadius, aSeed, aShade, aMicroId, aSpecies;
    uniform float uTime,uRadiusScale,uMicroDetail,uMotionKind,uCssHeight,uRotor,uShutter,uTumble,uCut,uBufferHeight;
    uniform highp sampler2D uSim;
    varying vec3 vCenter, vColor, vWorldCenter;
    varying vec2 vVel;
    varying float vRadius, vShade, vAnchorZ,vDust,vSpecies;
    ${organicField}
    vec3 rotY(vec3 v,float a){float c=cos(a),s=sin(a);return vec3(c*v.x+s*v.z,v.y,-s*v.x+c*v.z);}
    // Brownian-like wander: a Catmull-Rom curve through random keyframes, so speed and direction change irregularly.
    vec3 hash3(float n){return fract(sin(vec3(n,n+1.7,n+3.1))*vec3(43758.5453,22578.1459,19642.349))*2.-1.;}
    vec3 wander(float seed,float t){
      float i=floor(t),f=fract(t),k=seed*17.31;vec3 a=hash3(k+i-1.),b=hash3(k+i),c=hash3(k+i+1.),d=hash3(k+i+2.);
      return .5*(2.*b+(c-a)*f+(2.*a-5.*b+4.*c-d)*f*f+(3.*b-a-3.*c+d)*f*f*f);
    }
    // Flagellar bundle: every filament (the detailed one included) twists around a shared axis above the pole as one rotating helical wave,
    // and splays apart during a tumble. c is a point on a member's straight rest line; p is arc length past the bundle base.
    vec3 bundlePos(vec3 c,float p,float rot){
      if(p<=0.)return c;
      float sp=uTumble*smoothstep(0.,90.,p),ph=.0314*p-rot*.55,tw=ph*(1.-sp),cs=cos(tw),sn=sin(tw);
      vec2 d=c.xz;c.xz=vec2(cs*d.x-sn*d.y,sn*d.x+cs*d.y);vec2 sd=normalize(d+vec2(.001));
      c+=vec3(cos(ph),0.,sin(ph))*14.*smoothstep(0.,60.,p)*(1.-.6*sp);
      return c+vec3(sd.x,0.,sd.y)*sp*32.+vec3(sin(p*.12+d.x),0.,cos(p*.1+d.y))*sp*7.;
    }
    // Detailed filament centerline (local to the motor, origin at the rotor axis): rises from the hook, curves into its bundle slot,
    // and keeps a close-up supercoil that fades out as it joins. 13.4 units of rise bring the hook top (y 6.6) to the bundle base (y 20).
    vec3 heroPath(float s,float rot){
      vec3 b=bundlePos(vec3(2.77,20.+s-13.4,1.6),s-13.4,rot)-vec3(2.1,0.,.1);
      vec3 c=mix(vec3(0.,6.6+s,0.),b,smoothstep(0.,13.4,s));
      float amp=1.25*smoothstep(.5,6.,s)*(1.-smoothstep(18.,40.,s));
      return c+vec3(amp*cos(.68*s-rot),0.,amp*sin(.68*s-rot));
    }
    // Flagellar filament: sub holds (arc length, azimuth, radius) on the flagellin lattice; o is (radial, tangential, axial) inside one subunit.
    vec3 filamentPos(vec3 sub,vec3 o,float rot,float t){
      float sl=sub.x,phi=sub.y-rot,rr=sub.z*(1.+.02*sin(t*1.7+sl*2.3+sub.y*3.));
      vec3 T=normalize(heroPath(sl+.06,rot)-heroPath(sl-.06,rot));
      vec3 N=normalize(cross(T,vec3(0.,0.,1.))),B=cross(N,T);
      vec3 R=cos(phi)*N+sin(phi)*B,Tg=-sin(phi)*N+cos(phi)*B;
      return heroPath(sl,rot)+R*(rr+o.x)+Tg*o.y+T*o.z;
    }
    // Stator units: each MotA pentamer spins about its own axis against the rotor and pulses with a power stroke.
    vec3 statorPose(vec3 rel,float rot,float k,float t){
      rel=rotY(rel,-rot*2.6);
      float stroke=pow(.5+.5*sin(rot*9.+k*2.3),3.);
      rel.xz*=1.+.06*stroke;rel.y+=.04*sin(t*3.1+k*1.7)-.03*stroke;
      return rel;
    }
    void main(){
      float p=aSeed;
      float moving=step(0.,p),tm=uTime*(.65+fract(p*.173)*.65);
      vec3 drift=moving*(wander(p,tm*.42+p)*.2+vec3(sin(tm*2.7+p*3.),cos(tm*2.3+p),sin(tm*2.1+p*2.))*.022);
      vec3 off=aOffset;
      if(uMicroDetail>.5){
        if(aMicroId>.5){float h=dot(aOffset,vec3(127.1,311.7,74.7))+aMicroId*13.47;vec3 mn=normalize(vec3(sin(h),sin(h*1.71+1.),cos(h*2.31)));off+=mn*aRadius*.65;}
      }
      vec3 subOff=off;
      float angle=tm*.42*moving*sin(p),c=cos(angle),s=sin(angle);
      off=vec3(c*off.x+s*off.z,off.y,-s*off.x+c*off.z);
      angle=tm*.26*moving*cos(p*1.7);c=cos(angle);s=sin(angle);
      off=vec3(off.x,c*off.y-s*off.z,s*off.y+c*off.z);
      off*=1.+moving*.035*sin(tm*2.+p+off.y*1.2);
      // Domain hinge: the upper lobe of each protein flexes against the lower one.
      float hinge=moving*.16*sin(tm*1.35+p*2.1)*smoothstep(-.05,.2,off.y);
      off.xy+=vec2(-off.y,off.x)*hinge;
      vec3 centerPos=aCenter;float life=1.,anchorZ=0.;
      if(uMotionKind>.5&&uMotionKind<1.5||uMotionKind>3.5&&uMotionKind<5.5)centerPos.y+=memWave(aCenter.xz,uTime);
      if(uMotionKind>.5&&uMotionKind<1.5){float h=max(aCenter.y-surfY(aCenter.xz,5.1),0.);float gust=1.+.9*smoothstep(.2,1.,sin(uTime*.33+aCenter.x*.11+aCenter.z*.07));off.x+=sin(uTime*1.7+aCenter.x*.8+aCenter.z*.3)*h*.12*gust;off.z+=cos(uTime*1.2+aCenter.x*.6)*h*.07*gust;}
      if(uMotionKind>1.5&&uMotionKind<2.5){float q=fract(uTime*.22+p*.071),r=2.55,y=-1.25;float a=floor(p)*2.39996;if(q<.55){float t=q/.55;r=mix(5.,2.55,t);y=mix(-5.,-1.25,t);a+=sin(t*3.14159)*.7;}else if(q>.75){float t=(q-.75)/.25;r=mix(2.55,5.,t);y=mix(-1.25,-5.,t);a-=sin(t*3.14159)*.7;}centerPos=vec3(2.1+cos(a)*r,y,.1+sin(a)*r);drift*=.12;}
      if(uMotionKind>2.5&&uMotionKind<3.5){float q=fract(uTime*(.38+fract(p)*.3)+p*.137);float a=floor(p)*.5712;centerPos=vec3(2.1+cos(a)*2.78,mix(3.6,-.6,q),.1+sin(a)*2.78);drift=vec3(sin(q*17.+p),0.,cos(q*13.+p))*.04;life=smoothstep(0.,.08,q)*(1.-smoothstep(.92,1.,q));}
      if(uMotionKind>3.5&&uMotionKind<4.5){off.y+=sin(uTime*2.2+aCenter.x*2.+aCenter.z*1.3)*.022;off.x+=sin(uTime*3.+aCenter.x*3.7+aCenter.z*2.9)*.012;}
      if(uMotionKind>4.5&&uMotionKind<5.5){float a=uTime*1.3+aCenter.x*.4;c=cos(a);s=sin(a);off=vec3(c*off.x+s*off.z,off.y,-s*off.x+c*off.z);off.y+=sin(uTime*3.+aCenter.x)*.035;}
      vec3 statorCenter=vec3(0.),statorRel=vec3(0.);float statorK=0.,stator=0.;
      if(uMotionKind>5.5&&uMotionKind<6.5&&aCenter.y<.8){
        float seg=6.2831853/11.;statorK=floor(atan(aCenter.z,aCenter.x)/seg+.5);statorCenter=vec3(cos(statorK*seg)*2.78,0.,sin(statorK*seg)*2.78);
        statorRel=centerPos+off-statorCenter;centerPos=statorCenter;off=statorPose(statorRel,uRotor,statorK,uTime);stator=1.;
      }
      if(uMotionKind>7.5&&uMotionKind<8.5){centerPos+=vec3(sin(tm*.52+p)+.28*sin(tm*1.9+p*3.),cos(tm*.61+p*1.3),sin(tm*.43+p*2.))*(.4+fract(p)*.7);}
      if(uMotionKind>8.5&&uMotionKind<9.5){centerPos=filamentPos(aCenter,subOff,uRotor,uTime);off=vec3(0.);drift=vec3(0.);anchorZ=-1e4;}
      // CheY-P messengers wander from the signaling complexes and dock under the C ring.
      if(uMotionKind>9.5&&uMotionKind<10.5){
        float q=fract(uTime*(.05+fract(p*.37)*.04)+fract(p*.61)),e=q*q*(3.-2.*q),a=p*2.39996;
        vec3 dst=vec3(2.1+cos(a)*2.05,-1.95,.1+sin(a)*2.05);
        vec3 wander=vec3(sin(q*19.+p)+.5*sin(q*41.+p*2.),.7*sin(q*23.+p*1.3),cos(q*17.+p*.7)+.5*cos(q*37.+p))*sin(q*3.14159)*1.1;
        centerPos=mix(aCenter,dst,e)+wander;drift*=.2;
        life=smoothstep(0.,.06,q)*(1.-smoothstep(.9,1.,q));
      }
      // Polymers (DNA and bound proteins): a smooth shared field bends the whole strand coherently.
      if(uMotionKind>10.5&&uMotionKind<11.5){off+=vec3(sin(uTime*.5+off.y*.9+off.z*.5),.7*sin(uTime*.4+off.x*.8),cos(uTime*.45+off.x*.6+off.y*.7))*.14;}
      // mRNA sliding through a polysome: aOffset is the path direction, aSeed the arc position.
      if(uMotionKind>11.5&&uMotionKind<12.5){
        float u=mod(p+uTime*.3,7.);
        centerPos=polysomePath(aCenter,aOffset,u);off=vec3(0.);drift=vec3(0.);
        life=smoothstep(0.,.4,u)*(1.-smoothstep(6.6,7.,u));
      }
      // Nascent chains grow from each ribosome exit tunnel, then release; aSeed = -(1 + fraction along the chain).
      if(uMotionKind>12.5&&uMotionKind<13.5){
        float f=-p-1.,g=fract(uTime*.045+fract(aCenter.x*.37+aCenter.z*.71));
        life=smoothstep(f-.02,f,g)*(1.-smoothstep(.96,1.,g));
        off+=vec3(sin(uTime*.9+f*9.),cos(uTime*.7+f*7.),sin(uTime*.8+f*11.))*.15*f;
      }
      // Efflux substrates rise through the pump and leave the cell.
      if(uMotionKind>13.5&&uMotionKind<14.5){
        float q=fract(uTime*(.16+fract(p*.29)*.08)+fract(p*.53)),esc=max(q-.8,0.);
        centerPos=aCenter+vec3(sin(q*13.+p)*.06,mix(-.2,3.6,q)+esc*4.,cos(q*11.+p)*.06)+vec3(sin(p),0.,cos(p))*esc*6.;
        off=vec3(0.);drift=vec3(0.);life=smoothstep(0.,.05,q)*(1.-smoothstep(.93,1.,q));
      }
      // Whole-cell section rim: aCenter = (segment, cap angle or height, layer radius); the bead rides the cutaway plane.
      if(uMotionKind>15.5&&uMotionKind<16.5){
        float zc=uCut-aOffset.x,seg=aCenter.x,t=aCenter.y,r=aCenter.z;
        float rp=(seg>.5&&seg<1.5)||seg>2.5?r-pinch(t):r,rr=sqrt(max(rp*rp-zc*zc,0.));
        centerPos=seg<.5?vec3(rr*sin(t),-35.+rr*cos(t),zc):seg<1.5?vec3(rr,t,zc):seg<2.5?vec3(rr*sin(t),-175.-rr*cos(t),zc):vec3(-rr,t,zc);
        off=vec3(0.,sin(uTime*2.2+centerPos.x*2.+centerPos.y*1.3)*.02,0.);drift=vec3(0.);
      }
      // Hairs (LPS tufts, pili): offsets grow from a surface root and sway more toward the tip.
      if(uMotionKind>14.5&&uMotionKind<15.5){
        if(abs(fract(p)-.5)<.01)life=smoothstep(16.,26.,distance(cameraPosition,(modelMatrix*vec4(aCenter,1.)).xyz));
        off=subOff;float L=length(off);vec3 dir=off/max(L,.001),sw=vec3(sin(uTime*.7+p+L*.05),.4*sin(uTime*.5+p*2.),cos(uTime*.55+p*1.3+L*.04));
        off+=(sw-dir*dot(sw,dir))*L*L*.0016;drift=vec3(0.);
      }
      // Macro flagella: aSeed is arc length past the bundle base; the bundle is a rotating helical wave that splays apart during tumbles.
      if(uMotionKind>16.5&&uMotionKind<17.5){
        off=subOff;drift=vec3(0.);centerPos=bundlePos(aCenter,p,uRotor);anchorZ=p>0.?-1e4:0.;
      }
      // FtsZ treadmilling: filament segments travel around the division ring in both directions.
      if(uMotionKind>17.5&&uMotionKind<18.5){
        float dir=fract(p)>.5?1.:-1.,a=aCenter.x+aOffset.x+uTime*.09*dir,r=aCenter.z+aOffset.z;
        centerPos=vec3(cos(a)*r,-105.+aCenter.y+aOffset.y,sin(a)*r);off=vec3(0.);drift=vec3(0.);
      }
      // Min proteins: visibility follows the live reaction-diffusion profile (row 255 of the simulation texture).
      if(uMotionKind>18.5&&uMotionKind<19.5){
        float u=clamp((5.-aCenter.y)/220.,0.,.9999)*100.;vec4 m=texelFetch(uSim,ivec2(int(u),0),0);
        life=smoothstep(.12,.55,aOffset.x>.5?m.g:m.r);off=vec3(0.);drift*=.3;
      }
      // Streamed whole-cell molecules: each jiggles and turns in its crowded cage, faster for smaller proteins (amplitude from D in aSeed's fraction).
      if(uMotionKind>24.5&&uMotionKind<25.5){
        float id=floor(p),amp=fract(p);
        centerPos=aCenter+wander(id*.618+aCenter.x*.013,uTime*(.22+amp*.7)+id*.1)*amp*.5;
        off=rotY(subOff,id*2.4+wander(id+5.3,uTime*.15*(.3+amp)).y*1.4*amp);drift=vec3(0.);
      }
      // Small molecules diffuse faster and farther than proteins: a long wander plus a quick tremor.
      if(uMotionKind>19.5&&uMotionKind<20.5){drift=wander(p,uTime*.85+p)*.95+wander(p+7.,uTime*3.2)*.12;}
      // GroES lid: binds, caps the folding chamber, then lifts off and drifts away once per cycle.
      if(uMotionKind>20.5&&uMotionKind<21.5){
        float ph=fract(uTime/9.5+fract(aCenter.x*.173+aCenter.z*.311)),open=smoothstep(.5,.62,ph)*(1.-smoothstep(.88,.98,ph)),a=open*.75;
        off.y+=open*1.25;off=vec3(off.x,cos(a)*off.y-sin(a)*off.z,sin(a)*off.y+cos(a)*off.z)+wander(aCenter.x,uTime*.6)*open*.4;life=1.-open*.8;
      }
      // EF-Tu carries an aminoacyl-tRNA to a ribosome, docks at the A site, then releases.
      if(uMotionKind>21.5&&uMotionKind<22.5){
        float q=fract(uTime*(.07+fract(p*.31)*.04)+fract(p*.57)),e=smoothstep(0.,.55,q);
        vec3 dir=normalize(vec3(sin(p*12.9),.6*cos(p*7.3),sin(p*4.1+1.)));
        centerPos=mix(aCenter+dir*5.5,aCenter+dir*1.15,e)+wander(p,uTime*.8)*(1.-e)*.8;
        off=rotY(subOff,uTime*.4*(1.-e)+p);drift=vec3(0.);life=smoothstep(0.,.06,q)*(1.-smoothstep(.82,.92,q));
      }
      vec3 localPos=centerPos+off+drift,prevLocal;
      if(uMotionKind>5.5&&uMotionKind<7.5)localPos=organicShape(localPos,uTime);
      // Positions over a short virtual shutter drive the motion-blur velocity buffer.
      if(uMotionKind>6.5&&uMotionKind<7.5)prevLocal=rotY(localPos,-uShutter);
      else if(stator>.5)prevLocal=organicShape(statorCenter+statorPose(statorRel,uRotor-uShutter,statorK,uTime),uTime);
      else if(uMotionKind>8.5&&uMotionKind<9.5)prevLocal=filamentPos(aCenter,subOff,uRotor-uShutter,uTime);
      else prevLocal=localPos;
      vec4 world=modelMatrix*vec4(localPos,1.);
      vAnchorZ=anchorZ<-1e3?anchorZ:(modelMatrix*vec4(centerPos+drift,1.)).z;
      vec4 center=viewMatrix*world;
      vec4 curClip=projectionMatrix*center,prevClip=projectionMatrix*viewMatrix*modelMatrix*vec4(prevLocal,1.);
      vVel=(curClip.xy/curClip.w-prevClip.xy/prevClip.w)*.5;
      float microScale=uMicroDetail>.5?(aMicroId<.5?.79:.43):1.;
      vCenter=center.xyz;vWorldCenter=world.xyz;vRadius=aRadius*uRadiusScale*microScale*life;vColor=aColor;vShade=aShade;
      vDust=step(7.5,uMotionKind)*step(uMotionKind,8.5);
      if(vDust>.5)vRadius=min(vRadius,3.*(-center.z)/(projectionMatrix[1][1]*uCssHeight));
      vSpecies=aSpecies;
      gl_Position=projectionMatrix*center;
      gl_PointSize=max(1.,2.16*vRadius*projectionMatrix[1][1]*.5*uBufferHeight/max(-center.z,.01));
    }`;
  // Lighting: warm wrapped key, cool sky/ground ambient, soft sheen and a colored translucent rim. Velocity goes to a second target for motion blur.
  const velocityOut='layout(location = 1) out highp vec4 gVel;\n';
  const beadFragment = velocityOut+`
    uniform float uCut,uPick;uniform vec2 uFog;uniform mat4 projectionMatrix;
    varying vec3 vCenter,vColor,vWorldCenter;
    varying vec2 vVel;
    varying float vRadius,vShade,vAnchorZ,vDust,vSpecies;
    void main(){
      vec2 vUv=vec2(gl_PointCoord.x*2.-1.,1.-gl_PointCoord.y*2.);
      vec3 ray=normalize(vec3(vCenter.xy+vUv*vRadius*1.08,vCenter.z));
      float b=dot(ray,vCenter);float c=dot(vCenter,vCenter)-vRadius*vRadius;
      float h=b*b-c;if(h<0.)discard;
      float t=b-sqrt(h);if(t<=0.)discard;
      vec3 p=ray*t;vec3 normal=normalize(p-vCenter);
      vec3 worldP=vWorldCenter+(p-vCenter)*mat3(viewMatrix);
      if(vAnchorZ>uCut&&vDust<.5)discard;
      vec4 clip=projectionMatrix*vec4(p,1.);gl_FragDepth=clip.z/clip.w*.5+.5;
      vec3 light=normalize(mat3(viewMatrix)*vec3(-.35,.9,1.1));
      vec3 sw=sin(worldP*vec3(92.,83.,87.)),cw=cos(worldP*vec3(92.,83.,87.));
      vec3 rough=vec3(cw.x*sw.y*sw.z,sw.x*cw.y*sw.z,sw.x*sw.y*cw.z);
      normal=normalize(normal+mat3(viewMatrix)*rough*.1);
      vec3 wn=normalize(normal*mat3(viewMatrix)),eye=-normalize(p);
      float wrap=max((dot(normal,light)+.38)/1.38,0.);
      vec3 ambient=mix(vec3(.25,.23,.30),vec3(.48,.54,.58),wn.y*.5+.5);
      float back=max(dot(normal,normalize(mat3(viewMatrix)*vec3(.8,.4,-.4))),0.);
      float rim=pow(1.-max(dot(normal,eye),0.),2.5);
      float grain=sw.x*sw.y*sw.z;
      float sheen=pow(max(dot(reflect(-light,normal),eye),0.),16.)*.09;
      vec3 col=vColor*(ambient+vec3(1.,.95,.86)*.92*wrap*wrap+vec3(.55,.7,.85)*.13*back)*mix(.69,1.,vShade)*(.98+grain*.025)+sheen*vec3(1.,.97,.9)+vColor*vColor*.16*rim;
      float fog=smoothstep(uFog.x,uFog.y,-p.z);col=mix(col,vec3(.008,.024,.036),fog*.45);
      gl_FragColor=vec4(col,1.);gVel=vec4(vVel*12.+.5,0.,1.);
      if(uPick>.5){if(vDust>.5)discard;gl_FragColor=vec4(mod(vSpecies,256.)/255.,floor(vSpecies/256.)/255.,0.,1.);}
      else if(vDust>.5){gl_FragColor=vec4(vec3(.72,.84,.86),smoothstep(0.,.45,h/max(vRadius*vRadius,.000001))*.5*(1.-smoothstep(30.,65.,-p.z)));gVel=vec4(0.);}
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;
  class Beads {
    constructor(detail=false){ this.c=[];this.o=[];this.r=[];this.colors=[];this.seeds=[];this.shades=[];this.detail=detail; }
    add(center,offset,r,color,phase=-1,shade=1){ this.c.push(...center);this.o.push(...offset);this.r.push(r);const cc=rgb(color);this.colors.push(cc.r,cc.g,cc.b);this.seeds.push(phase);this.shades.push(shade); }
    build(parent,motionKind=0){
      if(!this.r.length)return;
      const geo=new THREE.InstancedBufferGeometry();
      geo.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(12),3));geo.setAttribute('aMicroId',new THREE.Float32BufferAttribute([0,1,2,3],1));geo.setDrawRange(0,this.detail?4:1);
      for(const [name,arr,size] of [['aCenter',this.c,3],['aOffset',this.o,3],['aRadius',this.r,1],['aColor',this.colors,3],['aSeed',this.seeds,1],['aShade',this.shades,1]]){
        const data=new Float32Array(arr.length);let index=0;
        // Interleave atom subsets so lower detail thins every molecule equally.
        for(let subset=0;subset<3;subset++)for(let i=subset;i<this.r.length;i+=3)for(let j=0;j<size;j++)data[index++]=arr[i*size+j];
        geo.setAttribute(name,new THREE.InstancedBufferAttribute(data,size));
      }
      geo.instanceCount=this.r.length;
      const mat=beadMaterial(motionKind,this.detail);
      const mesh=new THREE.Points(geo,mat);mesh.frustumCulled=false;mesh.userData.fullCount=this.r.length;mesh.userData.detail=this.detail;beadMeshes.push(mesh);parent.add(mesh);metrics.sphereCount+=this.r.length;return mesh;
    }
    // Split into ~10-unit cells by bead position; each chunk gets a bounding sphere padded by how far its kind can move.
    buildChunked(parent,motionKind=0,margin=2.5){
      const n=this.r.length;if(!n)return;
      const cells=new Map();
      for(let i=0;i<n;i++){const k=Math.floor((this.c[i*3]+this.o[i*3])/10)+','+Math.floor((this.c[i*3+1]+this.o[i*3+1])/10)+','+Math.floor((this.c[i*3+2]+this.o[i*3+2])/10);if(!cells.has(k))cells.set(k,[]);cells.get(k).push(i);}
      let first=null;
      for(const idx of cells.values()){
        const part=new Beads(this.detail);
        for(const i of idx){part.c.push(this.c[i*3],this.c[i*3+1],this.c[i*3+2]);part.o.push(this.o[i*3],this.o[i*3+1],this.o[i*3+2]);part.r.push(this.r[i]);part.colors.push(this.colors[i*3],this.colors[i*3+1],this.colors[i*3+2]);part.seeds.push(this.seeds[i]);part.shades.push(this.shades[i]);}
        const mesh=part.build(parent,motionKind);const box=new THREE.Box3();const v=new THREE.Vector3();
        for(let i=0;i<part.r.length;i++)box.expandByPoint(v.set(part.c[i*3]+part.o[i*3],part.c[i*3+1]+part.o[i*3+1],part.c[i*3+2]+part.o[i*3+2]));
        mesh.geometry.boundingSphere=box.getBoundingSphere(new THREE.Sphere());mesh.geometry.boundingSphere.radius+=margin;mesh.frustumCulled=true;mesh.userData.chunked=true;first??=mesh;
      }
      return first;
    }
  }
  function beadMaterial(motionKind,detail){
    const mat=new THREE.ShaderMaterial({vertexShader:beadVertex,fragmentShader:beadFragment,transparent:motionKind===8,depthWrite:motionKind!==8,uniforms:{uTime:timeUniform,uCut:cutUniform,uBufferHeight:bufferHeightUniform,uRadiusScale:{value:1},uMicroDetail:{value:detail?1:0},uMotionKind:{value:motionKind},uCssHeight:heightUniform,uRotor:rotorUniform,uShutter:shutterUniform,uTumble:tumbleUniform,uFog:fogUniform,uSim:simUniform,uPick:pickUniform}});
    materials.push(mat);return mat;
  }
  // With a pivot, atoms are stored relative to it so a shader motion can move the whole assembly as one body.
  function ball(batch, center, radii, color, count=100, phase=-1, pivot=null){
    const index=count>200?3:count>130?2:random()<.55?0:1;
    const atoms=templates[index].atoms;
    const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(range(0,6.28),range(0,6.28),range(0,6.28)));
    const v=new THREE.Vector3();
    const scale=Math.cbrt(radii[0]*radii[1]*radii[2])*1.45;
    const base=pivot??center,shift=pivot?[center[0]-pivot[0],center[1]-pivot[1],center[2]-pivot[2]]:[0,0,0];
    for(let i=0;i<atoms.length;i+=5){
      v.set(atoms[i],atoms[i+1],atoms[i+2]).applyQuaternion(rotation);
      batch.add(base,[shift[0]+v.x*radii[0]*1.6,shift[1]+v.y*radii[1]*1.6,shift[2]+v.z*radii[2]*1.6],atoms[i+3]*scale*1.05,color,phase,.66+.34*atoms[i+4]);
    }
  }
  function chain(batch, points, radius, color){for(const p of points)batch.add(p,[0,0,0],radius*range(.8,1.15),color);}
  function surf(x,z,base){return -35+Math.sqrt((35+base)**2-x*x-z*z);}
  const membraneBeads = new Beads(), wallBeads=new Beads(), periplasm=new Beads(true);
  // OmpF-like porin trimers: three beta-barrels per trimer span the outer membrane; lipids are cleared from their footprint.
  const porins=[],effluxSites=[[-5.5,-.4],[-12.5,1.2],[10.5,-.8],[15,-2.5],[-17,-1.8],[7.5,1.4]];
  for(let i=0;i<150;i++){const x=range(-20,20),z=range(-11.5,3.6);if(Math.hypot(x-2.1,z-.1)>2.7&&porins.every(p=>Math.hypot(p[0]-x,p[1]-z)>.75)&&effluxSites.every(p=>Math.hypot(p[0]-x,p[1]-z)>1.1))porins.push([x,z,range(0,6.283)]);}
  for(const [x,z,rot] of porins)for(let b=0;b<3;b++){
    const cx=x+Math.cos(rot+b*2.094)*.2,cz=z+Math.sin(rot+b*2.094)*.2;
    for(let y=-.25;y<=.25;y+=.05)for(let k=0;k<16;k++){const a=k*Math.PI/8+y*2.6;membraneBeads.add([cx+Math.cos(a)*.15,surf(cx,cz,4.865)+y,cz+Math.sin(a)*.15],[0,0,0],.031,k%2?'#3fb69c':'#57c9ab',-1,.78+.22*Math.cos(a-rot));}
    for(let k=0;k<10;k++){const a=k*.628;membraneBeads.add([cx+Math.cos(a)*.12,surf(cx,cz,4.865)+.28,cz+Math.sin(a)*.12],[0,0,0],.04,'#7fdcbc');}
  }
  const inPorin=(x,z)=>porins.some(p=>Math.abs(p[0]-x)<.45&&Math.abs(p[1]-z)<.45)||effluxSites.some(p=>Math.hypot(p[0]-x,p[1]-z)<.36);
  // Bilayers: a head group in each leaflet plus two tail segments reaching toward the midplane, so the cut edge reads as a striped bilayer.
  const tails=new Beads();
  function lipid(x,z,top,bottom,headTop,headBottom,tailTop,tailBottom){
    membraneBeads.add([x,surf(x,z,top)+range(-.03,.03),z],[0,0,0],range(.036,.05),headTop);
    membraneBeads.add([x,surf(x,z,bottom)+range(-.02,.02),z],[0,0,0],range(.04,.048),headBottom);
    const mid=(top+bottom)/2,wob=range(-.012,.012);
    tails.add([x+wob,surf(x,z,top-.06),z],[0,0,0],.024,tailTop,-1,.8);tails.add([x-wob,surf(x,z,mid+.025),z],[0,0,0],.022,tailTop,-1,.66);
    tails.add([x-wob,surf(x,z,bottom+.06),z],[0,0,0],.024,tailBottom,-1,.8);tails.add([x+wob,surf(x,z,mid-.025),z],[0,0,0],.022,tailBottom,-1,.66);
  }
  const lpsCore=new Beads();
  for(let x=-21;x<21;x+=.115)for(let z=-12;z<4;z+=.12){
    const xx=x+range(-.035,.035),zz=z+range(-.035,.035);
    if(Math.hypot(xx-2.1,zz-.1)<1.15)continue;
    lipid(xx,zz,1.85,1.58,'#a9e7dc','#639e9e','#d3f1ea','#9fcfca');
    if(!inPorin(xx,zz)){
      lipid(xx,zz,5.0,4.73,'#aaf34b','#638a41','#d9f3a6','#a9c97e');
      // LPS inner core sugars stud the outer surface with yellow beads.
      if(random()<.26)lpsCore.add([xx+range(-.03,.03),surf(xx,zz,5.075),zz+range(-.03,.03)],[0,0,0],range(.036,.05),random()<.5?'#f3d84e':'#e8c43a');
    }
  }
  // Peptidoglycan: wavy glycan strands with peptide stems that bridge to neighbors above and below.
  for(let z=-12;z<4;z+=.2){
    const ph=range(0,6.283);let n=0;
    for(let x=-21;x<21;x+=.058){
      if(Math.hypot(x-2.1,z-.1)<1.3)continue;
      const zz=z+Math.sin(x*1.3+ph)*.045,y=surf(x,zz,4.02)+Math.sin(x*2.2+ph)*.035;
      wallBeads.add([x,y,zz],[0,0,0],.04,'#efe7cc',-1,.86+.14*Math.sin(x*9+ph));
      if(++n%7===0){const dir=n%14===0?1:-1;for(let k=1;k<4;k++)wallBeads.add([x+k*.01,y+dir*k*.05,zz+k*.05],[0,0,0],.026,'#d9cfa5',-1,.8);}
    }
  }
  for(let i=0;i<500;i++){
    const x=range(-21,21),z=range(-12,4);if(Math.hypot(x-2.1,z-.1)<2.4)continue;
    const y=surf(x,z,range(2.45,3.35));ball(periplasm,[x,y,z],[range(.3,.55),range(.25,.45),range(.3,.55)],random()<.4?'#ddbd57':'#e7cf79',32,range(0,50));
  }
  membraneBeads.buildChunked(envelope,4,1.2);tails.buildChunked(envelope,4,1.2);lpsCore.buildChunked(envelope,4,1.2);wallBeads.buildChunked(envelope,4,1.2);periplasm.buildChunked(envelope,0,2.5);
  // Protons pumped out by respiration collect in the periplasm before flowing back through stators and ATP synthase.
  const periplasmProtons=new Beads();
  for(let i=0;i<700;i++){const x=range(-20,20),z=range(-11.5,3.8);periplasmProtons.add([x,surf(x,z,range(2.05,4.55)),z],[0,0,0],range(.028,.045),i%4?'#ff4fa8':'#ff7cc4',range(0,80));}
  periplasmProtons.build(particles,20);
  // AcrAB-TolC efflux pumps span both membranes: AcrB in the inner membrane, AcrA adaptors across the periplasm, the TolC channel through the outer membrane.
  const pumps=new Beads(true),drugs=new Beads();
  for(const [x,z] of effluxSites){
    const top=surf(x,z,5.08),bottom=top-1.4;
    for(let y=bottom;y<=top;y+=.045){const t=(y-bottom)/1.4,r=t>.72?.3:.22+.08*Math.sin(t*Math.PI/.72*.5);for(let k=0;k<20;k++){const a=k*Math.PI/10+y*(t>.72?0:3.2);pumps.add([x+Math.cos(a)*r,y,z+Math.sin(a)*r],[0,0,0],.046,(k+Math.floor(y*22))%2?'#5d47d6':'#7059ea',-1,.78+.22*Math.cos(a));}}
    for(let k=0;k<6;k++){const a=k*Math.PI/3;for(let t=0;t<1;t+=.03)pumps.add([x+Math.cos(a)*(.24+.12*Math.sin(t*Math.PI)),bottom-t*1.1,z+Math.sin(a)*(.24+.12*Math.sin(t*Math.PI))],[0,0,0],.055,'#8b74f0',-1,.85);}
    const ib=surf(x,z,1.85);for(let k=0;k<3;k++){const a=k*2.094;ball(pumps,[x+Math.cos(a)*.24,ib+.42,z+Math.sin(a)*.24],[.3,.3,.3],k%2?'#7a5fe0':'#8f76ee',65);ball(pumps,[x+Math.cos(a)*.2,ib-.12,z+Math.sin(a)*.2],[.16,.22,.16],'#6a52d0',32);}
    for(let i=0;i<7;i++)drugs.add([x,ib,z],[0,0,0],range(.05,.07),i%2?'#ffe45c':'#ffd23a',x*7.3+i*1.37+50);
  }
  pumps.build(envelope,4);drugs.build(particles,14);
  // Meshes also write the velocity target: rotor meshes report their spin over the virtual shutter, everything else is still.
  function material(color,organic=false,spinning=false,hole=false){
    const m=new THREE.MeshStandardMaterial({color,roughness:.94,metalness:0});
    m.onBeforeCompile=shader=>{
      shader.uniforms.uCut=cutUniform;shader.uniforms.uSpin=spinning?shutterUniform:{value:0};
      if(organic){shader.uniforms.uTime=timeUniform;shader.vertexShader='uniform float uTime;\n'+organicField+'\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n'+(organic==='membrane'?'transformed.y+=memWave(transformed.xz,uTime);':'transformed=organicShape(transformed,uTime);'));}
      shader.vertexShader='uniform float uSpin;varying vec3 vWorldCut;varying vec2 vVel;\n'+shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvWorldCut=(modelMatrix*vec4(transformed,1.)).xyz;\n{float sc=cos(-uSpin),ss=sin(-uSpin);vec3 pv=vec3(sc*transformed.x+ss*transformed.z,transformed.y,-ss*transformed.x+sc*transformed.z);vec4 pc=projectionMatrix*viewMatrix*modelMatrix*vec4(pv,1.);vVel=(gl_Position.xy/gl_Position.w-pc.xy/pc.w)*.5;}');
      shader.fragmentShader=velocityOut+'uniform float uCut;varying vec3 vWorldCut;varying vec2 vVel;\n'+shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(vWorldCut.z>uCut)discard;'+(hole?'if(abs(vWorldCut.x)<21.5&&vWorldCut.z>-12.5&&vWorldCut.z<4.5&&vWorldCut.y>-15.5)discard;':'')).replace('#include <dithering_fragment>','#include <dithering_fragment>\ngVel=vec4(vVel*12.+.5,0.,1.);');
    };m.customProgramCacheKey=()=>(organic==='membrane'?'membrane-v6':organic?'organic-v6':'clipped-v6')+(spinning?'-spin':'')+(hole?'-hole':'');materials.push(m);return m;
  }
  function ribbon(base,color){
    const positions=[],indices=[];const nx=100,nz=32;
    for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){const x=-21+42*i/nx,z=-12+16*j/nz;positions.push(x,surf(x,z,base),z);}
    for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i;indices.push(a,a+nx+1,a+1,a+1,a+nx+1,a+nx+2);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();
    const m=material(color,'membrane');m.side=THREE.DoubleSide;const mesh=new THREE.Mesh(g,m);envelope.add(mesh);
  }
  ribbon(1.7,'#64b1b7');ribbon(4.85,'#7e9d46');
  const strands=new Beads();
  // O-antigen tufts: dense, pale wheat-like fronds with feathered side chains, as in the reference.
  for(let i=0;i<1500;i++){
    const x=range(-21,21),z=range(-12,4);if(Math.hypot(x-2.1,z-.1)<2)continue;
    const length=range(.9,3.4),bend=range(-.45,.45),phase=range(0,7),pale=random()<.5;
    for(let s=0;s<length;s+=.06){const xx=x+bend*s*s/length+Math.sin(s*3+phase)*.05;strands.add([xx,surf(x,z,5.1)+s,z+Math.sin(s*1.7+phase)*.12],[0,0,0],.034*(1-.35*s/length),s>length-.14?'#f0efb8':pale?'#e2eb9c':'#cfdc86');}
    for(let j=0;j<5;j++){const height=length*range(.3,.95),side=j%2?1:-1,branch=range(.25,.55);for(let t=0;t<branch;t+=.055)strands.add([x+bend*height*height/length+side*t*.55,surf(x,z,5.1)+height+t*.8,z+Math.sin(height*1.7+phase)*.12+t*.25*side],[0,0,0],.025,pale?'#e9efb0':'#d6e295');}
  }strands.buildChunked(envelope,1,1.5);

  const crowd = new Beads(true);
  // Rejection packing prevents the visible rows and repeated spacing of a grid.
  const packing=new Map();
  // Large assemblies claim space first so the crowd packs around them instead of through them.
  function reserve(x,y,z,r){const k=[x,y,z].map(v=>Math.floor(v/2)).join(',');if(!packing.has(k))packing.set(k,[]);packing.get(k).push([x,y,z,r]);}

  // Chemoreceptor arrays: trimers of receptor dimers hang from the inner membrane as long fibrous bundles; CheA/CheW sit at their tips.
  const receptorArrays=new Beads(true),treeSites=[[-8,1],[-10,-2],[8,-1],[11,-4],[-13,.5],[13,-1.5],[-6,-2.6],[6.4,-3.2]];
  for(const [x,z] of treeSites){
    const y=surf(x,z,1.6);
    for(let t=0;t<1;t+=.25)reserve(x,y-.4-t*3.1,z,.62);
    ball(receptorArrays,[x,y-.3,z],[.36,.32,.4],'#69c7b2',145);
    for(let arm=0;arm<6;arm++){
      const a=arm*Math.PI/3;
      for(let j=0;j<6;j++){const t=j/5;ball(receptorArrays,[x+Math.cos(a)*(.15+t*.35),y-.45-t*2.8,z+Math.sin(a)*(.15+t*.35)],[.13,.35,.13],'#71c4b5',32);}
    }
    for(let f=0;f<14;f++){
      const a=f*.449+range(-.1,.1),spread=range(.08,.5),ph=range(0,6.283);
      for(let t=0;t<1;t+=.012)receptorArrays.add([x+Math.cos(a)*spread*(.3+t)+Math.sin(t*14+ph)*.03,y-.25-t*3.05,z+Math.sin(a)*spread*(.3+t)+Math.cos(t*12+ph)*.03],[0,0,0],.03,f%3?'#8fe2cf':'#5fbfac',-1,.85);
    }
    ball(receptorArrays,[x,y-3.5,z],[.6,.48,.65],'#66b7ae',210);
  }
  receptorArrays.buildChunked(proteins,4,1.2);

  // ATP synthase: the membrane c-ring and central stalk rotate (kind 5); the F1 head, a-subunit and peripheral stalk stay put (kind 4).
  const atpRotor=new Beads(true),atpStator=new Beads(true),atpSites=[[9.5,1.4],[-11.8,1.5],[15.5,-3],[5.2,1.6],[-1.6,1.4],[-16,1]].map(([x,z])=>[x,surf(x,z,1.715),z]);
  for(const site of atpSites){
    const [x,y,z]=site;reserve(x,y-1.25,z,.75);
    for(let k=0;k<10;k++){const a=k*Math.PI/5;ball(atpRotor,[x+Math.cos(a)*.3,y,z+Math.sin(a)*.3],[.085,.23,.085],k%2?'#3db8a5':'#4fcab4',32,-1,site);}
    ball(atpRotor,[x,y-.45,z],[.11,.2,.11],'#2f9c8c',32,-1,site);ball(atpRotor,[x,y-.82,z],[.1,.2,.1],'#2a8f80',32,-1,site);ball(atpRotor,[x+.09,y-.3,z],[.08,.08,.08],'#7ad6c4',32,-1,site);
    ball(atpStator,[x+.5,y,z],[.14,.22,.14],'#5fcfb9',32);
    for(let t=0;t<1;t+=.025)atpStator.add([x+.5-.08*t,y-.15-t*1.45,z+.05*Math.sin(t*3)],[0,0,0],.05,'#8ed8c6',-1,.85);
    for(let k=0;k<6;k++){const a=k*Math.PI/3;ball(atpStator,[x+Math.cos(a)*.3,y-1.25,z+Math.sin(a)*.3],[.19,.26,.19],k%2?'#a3e3d3':'#62c6b4',65);}
    ball(atpStator,[x+.28,y-1.62,z],[.14,.1,.14],'#8ed8c6',32);
  }
  atpRotor.build(proteins,5);atpStator.build(proteins,4);

  // Nucleoid DNA: double-stranded helices (two backbones, 3.4 nm pitch) with nucleoid-associated proteins bound along them.
  const dna=new Beads(),naps=new Beads(true);
  const up=new THREE.Vector3(0,1,0),cPt=new THREE.Vector3(),nPt=new THREE.Vector3(),tan=new THREE.Vector3(),nor=new THREE.Vector3(),bin=new THREE.Vector3();
  for(let strand=0;strand<12;strand++){
    const origin=[range(-15,-2),range(-11.5,-5.5),range(-7,1)],ph=[range(0,6),range(0,6),range(0,6),range(0,6)];
    const path=(t,out)=>out.set(origin[0]+Math.sin(t*.6+ph[0])*2.6+Math.sin(t*1.7+ph[1])*.6,origin[1]+Math.cos(t*.5+ph[2])*1.8+Math.sin(t*2.1)*.4,origin[2]+Math.sin(t*.7+ph[3])*1.5);
    let arc=0,nextNap=range(.5,2);
    for(let t=0;t<26;t+=.022){
      path(t,cPt);path(t+.01,nPt);tan.subVectors(nPt,cPt).normalize();nor.crossVectors(tan,up).normalize();bin.crossVectors(tan,nor);
      arc+=cPt.distanceTo(path(t-.022,nPt));const phi=arc*18.5;
      for(const [shift,color] of [[0,'#f3c63a'],[2.4,'#e9a637']]){const a=phi+shift;dna.add(origin,[cPt.x+(nor.x*Math.cos(a)+bin.x*Math.sin(a))*.07-origin[0],cPt.y+(nor.y*Math.cos(a)+bin.y*Math.sin(a))*.07-origin[1],cPt.z+(nor.z*Math.cos(a)+bin.z*Math.sin(a))*.07-origin[2]],.036,color);}
      if(arc>nextNap){nextNap=arc+range(1.8,3.2);ball(naps,[cPt.x+nor.x*.14,cPt.y+nor.y*.14,cPt.z+nor.z*.14],[.13,.12,.13],random()<.5?'#f08a3c':'#e8743a',32,-1,origin);}
    }
  }
  dna.buildChunked(proteins,11,1);naps.buildChunked(proteins,11,1.5);

  // Polysomes: mRNA slides through a string of ribosomes while each one extrudes a growing protein chain.
  const ribosomes=new Beads(true),mrna=new Beads(),nascent=new Beads(),polyPath=(o,d,u)=>{const perp=new THREE.Vector3().crossVectors(d,up).normalize();return new THREE.Vector3(...o).addScaledVector(d,u).addScaledVector(perp,Math.sin(u*.9+o[0])*.5).add(new THREE.Vector3(0,.35*Math.sin(u*.6+o[2]),0));};
  const polysomes=[[[-10.5,-4.2,-.6],[1,-.25,.3]],[[-4.5,-9.2,.4],[.8,.5,-.2]],[[6.2,-7.4,-.5],[-.5,-.2,-.84]]].map(([o,d])=>[o,new THREE.Vector3(...d).normalize()]);
  const ribosomeSites=[],rnapSites=[],rnap=new Beads(true),rnapDNA=new Beads();
  for(const [o,d] of polysomes){
    const perp=new THREE.Vector3().crossVectors(d,up).normalize();
    for(let u=1.1;u<6.6;u+=1.75){
      const P=polyPath(o,d,u),small=P.clone().addScaledVector(perp,.42).addScaledVector(up,.1),large=P.clone().addScaledVector(perp,-.66);
      reserve(small.x,small.y,small.z,.5);reserve(large.x,large.y,large.z,.75);ribosomeSites.push(large.toArray());
      ball(ribosomes,small.toArray(),[.5,.4,.45],'#d58bd8',250);ball(ribosomes,large.toArray(),[.78,.66,.72],'#9a4fb5',250);
      const exit=P.clone().addScaledVector(perp,-1.35),walk=new THREE.Vector3(),step=new THREE.Vector3();
      for(let i=0;i<46;i++){step.copy(perp).multiplyScalar(-.06).add(new THREE.Vector3(range(-.05,.05),range(-.05,.05),range(-.05,.05)));walk.add(step);nascent.add(exit.toArray(),walk.toArray(),.042,i%6<3?'#ff9f5a':'#ffb877',-(1+i/46));}
    }
    for(let u=0;u<7;u+=.045)mrna.add(o,d.toArray(),.04,'#ff6f61',u);
    // RNA polymerase sits where the mRNA begins, still reading a DNA template that threads through it.
    const R0=polyPath(o,d,0),templ=new THREE.Vector3().crossVectors(d,perp).normalize();rnapSites.push(R0.toArray());
    reserve(R0.x,R0.y,R0.z,.85);ball(rnap,R0.toArray(),[.62,.55,.6],'#3f8cff',250);ball(rnap,R0.clone().addScaledVector(perp,.35).toArray(),[.32,.3,.3],'#6fa8ff',65);
    for(let t=-3.2;t<=3.2;t+=.05){const a=t*18.5,c=R0.clone().addScaledVector(templ,t);for(const [shift,color] of [[0,'#f3c63a'],[2.4,'#e9a637']])rnapDNA.add(R0.toArray(),[c.x-R0.x+(perp.x*Math.cos(a+shift)+d.x*Math.sin(a+shift))*.07,c.y-R0.y+(perp.y*Math.cos(a+shift)+d.y*Math.sin(a+shift))*.07,c.z-R0.z+(perp.z*Math.cos(a+shift)+d.z*Math.sin(a+shift))*.07],.036,color);}
  }
  ribosomes.build(proteins);mrna.build(proteins,12);nascent.build(proteins,13);rnap.build(proteins);rnapDNA.build(proteins,11);
  // EF-Tu·tRNA ternary complexes: an L-shaped tRNA (red) held by EF-Tu (blue), two per ribosome.
  const deliveries=new Beads(true);
  ribosomeSites.forEach((site,i)=>{for(let k=0;k<2;k++){const seed=i*2+k+.41;
    for(let j=0;j<9;j++){deliveries.add(site,[j*.07,0,0],.055,'#ff5d73',seed);deliveries.add(site,[0,j*.07,0],.055,j>6?'#ffd166':'#ff5d73',seed);}
    ball(deliveries,[site[0]+.32,site[1]+.3,site[2]],[.22,.2,.2],'#6cc4ff',32,seed,site);}});
  deliveries.build(particles,22);
  // GroEL/GroES chaperonins: two stacked seven-member rings form a folding chamber; the GroES lid cycles on and off.
  const groel=new Beads(true),groes=new Beads(true),chaperoninSites=[[-8,-8.5,.8],[9,-3.5,1.2],[-2,-6,-2.5]];
  for(const [x,y,z] of chaperoninSites){
    reserve(x,y,z,.9);reserve(x,y+.9,z,.6);
    for(let ring=0;ring<2;ring++)for(let k=0;k<7;k++){const a=k*Math.PI*2/7+ring*.45;ball(groel,[x+Math.cos(a)*.45,y+(ring?.36:-.36),z+Math.sin(a)*.45],[.2,.3,.2],(k+ring)%2?'#7fe0a8':'#5cc98f',32);}
    const lid=[x,y+.78,z];for(let k=0;k<7;k++){const a=k*Math.PI*2/7;ball(groes,[x+Math.cos(a)*.3,y+.82,z+Math.sin(a)*.3],[.14,.09,.14],'#ffd166',32,-1,lid);}
    ball(groes,[x,y+.95,z],[.18,.07,.18],'#ffe08a',32,-1,lid);
  }
  groel.build(proteins);groes.build(proteins,21);
  for(let attempt=0;attempt<10500;attempt++){
    const x=range(-20,20),z=range(-11,3.8),y=range(-13,1.2);
    if(y>surf(x,z,.83))continue;
    if(Math.hypot(x-2.1,z-.1)<3.55&&y>-4.1)continue;
    const scale=range(.38,.83),cell=[x,y,z].map(v=>Math.floor(v/2));let overlaps=false;
    for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)for(let c=-1;c<=1;c++){
      for(const p of packing.get([cell[0]+a,cell[1]+b,cell[2]+c].join(','))??[]){if(Math.hypot(x-p[0],y-p[1],z-p[2])<(scale+p[3])*1.30)overlaps=true;}
    }
    if(overlaps)continue;
    const k=cell.join(',');if(!packing.has(k))packing.set(k,[]);packing.get(k).push([x,y,z,scale]);
    const col=palette[Math.floor(random()*palette.length)],phase=range(0,50);
    const radii=[scale*range(.8,1.25),scale*range(.75,1.2),scale*range(.8,1.2)];
    ball(crowd,[x,y,z],radii,col,scale>.72?210:60,phase);
  }
  const crowdMesh=crowd.buildChunked(proteins,0,2.5);
  {
    const wall=[],wi=[],nx=60,ny=16;
    for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){const x=-21+42*i/nx,top=surf(x,-11.6,.7),y=-14+(top+14)*j/ny;wall.push(x,y,-11.6);}
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i;wi.push(a,a+1,a+nx+1,a+1,a+nx+2,a+nx+1);}
    for(const [positions,indices] of [[wall,wi]]){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();const m=material('#1c3546');m.side=THREE.DoubleSide;proteins.add(new THREE.Mesh(g,m));}
  }

  // The hero motor has an independent rotor. Support assemblies remain anchored.
  const rotor = new THREE.Group();rotor.position.set(2.1,0,.1);motor.add(rotor);
  const fixed = new THREE.Group();fixed.position.copy(rotor.position);motor.add(fixed);
  const yellow=material('#f2dc20',true,true),goldSpin=material('#e4bf83',true,true),gold=material('#e4bf83',true);
  function tube(parent,r1,r2,h,y,mat){const geometry=new THREE.CylinderGeometry(r1,r2,h,96,18,true);geometry.translate(0,y,0);const mesh=new THREE.Mesh(geometry,mat);parent.add(mesh);return mesh;}
  function torus(parent,r,t,y,mat){const geometry=new THREE.TorusGeometry(r,t,18,120);geometry.rotateX(Math.PI/2);geometry.translate(0,y,0);const mesh=new THREE.Mesh(geometry,mat);parent.add(mesh);return mesh;}
  tube(rotor,2.32,2.32,1.35,-1.05,yellow);torus(rotor,2.24,.17,-1.75,yellow);torus(rotor,2.24,.18,-.35,yellow);
  tube(rotor,.27,.27,6.8,2.5,goldSpin);torus(rotor,.72,.16,1.9,yellow);torus(fixed,1.03,.22,4.02,gold);torus(fixed,1.13,.26,4.97,gold);
  const rotorBeads=new Beads(),supportBeads=new Beads(true);
  for(let i=0;i<34;i++){
    const a=i*Math.PI*2/34;
    ball(rotorBeads,[Math.cos(a)*2.28,-1.04,Math.sin(a)*2.28],[.23,.66,.22],'#ffe928',65);
    ball(rotorBeads,[Math.cos(a)*2.14,-.25,Math.sin(a)*2.14],[.15,.09,.14],'#fff34d',32);
    // FliM/FliN knobs give the C ring the studded rows seen in the reference.
    const b=a+Math.PI/34;
    ball(rotorBeads,[Math.cos(b)*2.4,-1.48,Math.sin(b)*2.4],[.13,.12,.11],'#ffe23a',32);
    ball(rotorBeads,[Math.cos(b)*2.4,-.64,Math.sin(b)*2.4],[.12,.11,.1],'#f6d62a',32);
  }
  for(let i=0;i<9;i++){
    const a=i*Math.PI*2/9;
    for(let t=0;t<1;t+=.014){const r=.25+t*1.65,curve=a+.14*Math.sin(t*Math.PI);for(let j=0;j<5;j++){const h=j*1.256+t*13.;rotorBeads.add([Math.cos(curve)*r+Math.sin(h)*.035,-1.15+t*.48-.16*Math.sin(t*Math.PI)+Math.cos(h)*.035,Math.sin(curve)*r],[0,0,0],.022,'#efc92a');}}
  }
  for(let i=0;i<110000;i++){
    const a=range(0,Math.PI*2),r=Math.sqrt(range(i%2?3.35:.42,5.6));
    const y=(i%2?-.34:-1.76)+range(-.025,.025);
    rotorBeads.add([Math.cos(a)*r,y,Math.sin(a)*r],[0,0,0],range(.012,.022),'#f9e32b',-1,range(.9,1.07));
  }
  for(let i=0;i<64000;i++){
    const a=range(0,6.283),y=range(-1.76,-.29),r=2.32+range(-.03,.03);
    rotorBeads.add([Math.cos(a)*r,y,Math.sin(a)*r],[0,0,0],range(.013,.022),'#f5dc20');
  }
  for(let i=0;i<16000;i++){
    const a=range(0,6.283),y=range(-1.67,-.36),r=1.84+range(-.025,.025);
    rotorBeads.add([Math.cos(a)*r,y,Math.sin(a)*r],[0,0,0],range(.023,.037),'#ceb52e',-1,.72);
  }
  for(let y=-.8;y<6.2;y+=.33)ball(rotorBeads,[0,y,0],[.2,.18,.2],'#d3b981',32);
  for(let i=0;i<26000;i++){const y=range(-1,6.2),a=range(0,6.283),r=.274+range(-.012,.012);rotorBeads.add([Math.cos(a+y*.7)*r,y,Math.sin(a+y*.7)*r],[0,0,0],range(.013,.022),'#d7bd88');}
  function coatRing(batch,r,t,y,color){
    for(let i=0;i<11000;i++){const a=range(0,6.283),b=range(0,6.283),tt=t*(1.+.09*Math.sin(a*13.)+.06*Math.sin(a*7.)),rr=r+Math.cos(b)*tt;batch.add([Math.cos(a)*rr,y+Math.sin(b)*tt,Math.sin(a)*rr],[0,0,0],range(.019,.033),color);}
  }
  coatRing(rotorBeads,2.24,.17,-1.75,'#e1c42e');coatRing(rotorBeads,2.24,.18,-.35,'#e5cb3d');coatRing(supportBeads,1.03,.22,4.02,'#c5ad72');coatRing(supportBeads,1.13,.26,4.97,'#d6bd86');coatRing(rotorBeads,.72,.16,1.9,'#ddc34a');
  for(let i=0;i<11;i++){
    const a=i*Math.PI*2/11,x=Math.cos(a)*2.78,z=Math.sin(a)*2.78;
    // MotA pentamer: five lumps around the MotB pair; the shader spins them as a unit.
    for(let k=0;k<5;k++){const b=k*Math.PI*2/5+a;ball(supportBeads,[x+Math.cos(b)*.27,.05,z+Math.sin(b)*.27],[.16,.47,.16],k%2?'#ff6fc2':'#ff8fd2',65);}
    for(let y=.65;y<3.3;y+=.035){const t=(y-.65)/2.65,bend=Math.sin(t*Math.PI)*.12*Math.sin(a*2.1);supportBeads.add([x+bend,y,z+Math.sin(t*Math.PI)*.06],[0,0,0],.031,'#c9bc5d');supportBeads.add([x+.075+bend,y,z+Math.sin(t*Math.PI)*.06],[0,0,0],.026,'#c2b452');}
    ball(supportBeads,[x+.04,1.4,z],[.08,.15,.08],'#cdb763',32);ball(supportBeads,[x+.04,2.7,z],[.1,.16,.09],'#d5c16d',32);
    ball(supportBeads,[x,3.25,z],[.3,.24,.3],'#d5bd65',65);
  }
  ball(rotorBeads,[0,-3.65,0],[.62,.4,.62],'#d77b33',250);
  for(let i=0;i<7;i++){
    const a=i*Math.PI*2/7;const points=[];
    for(let t=0;t<1;t+=.045)points.push([Math.cos(a)*(.45+t*1.6),-3.5+t*1.8,Math.sin(a)*(.45+t*1.6)]);
    chain(rotorBeads,points,.065,'#bd9c40');
  }
  // Hook (FlgE): a woven sleeve that flares where it leaves the outer membrane; crossing helical rows form the basket weave.
  for(let i=0;i<46000;i++){
    const y=range(5.12,6.78),t=(y-5.12)/1.66,a=range(0,6.283);
    const weave=Math.sin(a*11+y*15)*Math.sin(a*11-y*15),r=THREE.MathUtils.lerp(1.13,.86,Math.pow(t,.75))+weave*.045;
    rotorBeads.add([Math.cos(a)*r,y,Math.sin(a)*r],[0,0,0],range(.022,.034),weave>0?'#f0bb8f':'#cf9670',-1,weave>0?1:.78);
  }
  coatRing(rotorBeads,.88,.09,6.74,'#e6c993');
  rotorBeads.build(rotor,7);supportBeads.build(fixed,6);

  // Filament: flagellin follows the measured one-start helix (5.5 subunits per turn, 0.47 nm rise), which yields 11 protofilaments.
  const filament=new Beads(true),rise=.047,twist=65.45*Math.PI/180;
  for(let m=0;m*rise<60;m++){
    const s=m*rise,phi=m*twist,shade=.84+.16*Math.sin(m*.31);
    for(let j=0;j<10;j++)filament.add([s,phi,.42],[range(-.05,.05),range(-.2,.2),range(-.27,.27)],range(.07,.09),'#a8834f',-1,.6);
    for(let j=0;j<22;j++)filament.add([s,phi,.56],[range(-.1,.1),range(-.16,.16),range(-.26,.26)],range(.055,.075),'#cfab70',-1,.74);
    for(let j=0;j<34;j++){const u=range(-1,1);filament.add([s,phi,.76],[range(-.08,.1),u*.15+range(-.04,.04),u*.11+range(-.08,.08)],range(.045,.065),j%5?'#efd29a':'#f8e6b8',-1,shade);}
  }
  filament.build(fixed,9);


  // Local SDF proteins: each cube bounds a blended molecular field; rays never scan the entire cell.
  const sdfVertex=`varying vec3 vLocal;void main(){vLocal=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
  const sdfFragment=velocityOut+`
    uniform float uTime,uCut;uniform vec3 uColor;uniform mat4 uInvModel,modelMatrix,projectionMatrix;
    varying vec3 vLocal;
    float hash3(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
    float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);}
    float sm(float a,float b){float h=max(.28-abs(a-b),0.)/.28;return min(a,b)-h*h*.07;}
    float field(vec3 p){
      float d=length(p*vec3(.95,1.15,1.05))-.68;
      d=sm(d,length(p-vec3(.45,.12,.12))-.43);
      d=sm(d,length(p-vec3(-.38,.15,-.14))-.46);
      d=sm(d,length(p-vec3(.05,.47,-.08))-.4);
      return d+(noise3(p*32.)-.5)*.025+(noise3(p*61.)-.5)*.01;
    }
    void main(){
      vec3 ro=(uInvModel*vec4(cameraPosition,1.)).xyz,rd=normalize(vLocal-ro);
      vec3 inv=1./rd;vec3 t0=(-vec3(1.2)-ro)*inv,t1=(vec3(1.2)-ro)*inv;
      vec3 lo=min(t0,t1),hi=max(t0,t1);float t=max(max(lo.x,lo.y),lo.z);float end=min(min(hi.x,hi.y),hi.z);t=max(t,0.);
      vec3 p;bool hit=false;
      for(int i=0;i<72;i++){p=ro+rd*t;float d=field(p);if(abs(d)<.003){hit=true;break;}t+=max(d*.5,.002);if(t>end)break;}
      if(!hit)discard;
      vec3 wp=(modelMatrix*vec4(p,1.)).xyz;if(modelMatrix[3].z>uCut)discard;
      vec2 e=vec2(.003,0.);vec3 n=normalize(vec3(field(p+e.xyy)-field(p-e.xyy),field(p+e.yxy)-field(p-e.yxy),field(p+e.yyx)-field(p-e.yyx)));
      vec3 wn=normalize(mat3(modelMatrix)*n);float l=max(dot(wn,normalize(vec3(-.5,.9,.8))),0.);
      float ao=clamp(field(p+n*.16)/.16,.35,1.);
      vec3 col=uColor*(.48+1.05*l)*mix(.7,1.,ao);vec4 vp=viewMatrix*vec4(wp,1.);vec4 cp=projectionMatrix*vp;gl_FragDepth=cp.z/cp.w*.5+.5;
      gl_FragColor=vec4(mix(col,vec3(.008,.024,.036),smoothstep(24.,64.,-vp.z)*.45),1.);gVel=vec4(.5,.5,0.,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;
  // Respiratory complex stand-ins: membrane-docked peripheral arms that pump protons outward.
  const receptorSites=[[-5,1.1,.5],[-11.4,-.6,.6],[-3.3,-.7,.55],[-4.4,-2.3,.5]].map(([x,z,scale])=>[x,surf(x,z,1.58)-1.05,z,scale]);
  for(const [x,y,z,scale] of receptorSites){
    const mat=new THREE.ShaderMaterial({vertexShader:sdfVertex,fragmentShader:sdfFragment,uniforms:{uTime:timeUniform,uCut:cutUniform,uColor:{value:new THREE.Color('#8ce62c')},uInvModel:{value:new THREE.Matrix4()}}});
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(2.4,2.4,2.4),mat);mesh.position.set(x,y,z);mesh.scale.setScalar(scale);proteins.add(mesh);
    mesh.onBeforeRender=()=>{mesh.updateMatrixWorld();mat.uniforms.uInvModel.value.copy(mesh.matrixWorld).invert();};animated.push(mesh);materials.push(mat);
    const top=surf(x,z,1.7),length=top-y-.3;
    const stem=new THREE.Mesh(new THREE.CylinderGeometry(.07,.11,length,10),material('#85b557'));stem.position.set(x,y+.3+length/2,z);proteins.add(stem);
  }
  const messengers=new Beads(true);
  for(let i=0;i<32;i++){const [x,z]=treeSites[i%treeSites.length];ball(messengers,[x+range(-.4,.4),surf(x,z,1.6)-3.9,z+range(-.4,.4)],[.09,.1,.09],i%2?'#b8ff4a':'#93f03a',32,i+.53);}
  messengers.build(particles,10);

  // ── Whole cell ────────────────────────────────────────────────────────────────────────────────
  // The detailed window sits at the top pole of an E. coli-like rod at true scale (1 unit ≈ 10 nm): pole caps of radius 40
  // centred at y=-35 and y=-175, a dividing waist at y=-105. Here each sphere stands for a whole macromolecule.
  const macroStart=beadMeshes.length;
  const CELL={top:-35,bottom:-175,mid:-105};
  const pinch=y=>3.5*Math.exp(-(((y-CELL.mid)/7)**2));
  const inSlab=(x,y,z)=>Math.abs(x)<21.5&&y>-13.4&&z>-12.5&&z<5;
  // Distance from the cell axis segment, and the inner-membrane radius available at that height.
  const innerRoom=(x,y,z,margin)=>{const yy=Math.min(CELL.top,Math.max(CELL.bottom,y)),d=Math.hypot(x,y-yy,z),r=36.3-(y<CELL.top&&y>CELL.bottom?pinch(y):0);return d<r-margin;};
  // Capsule surface point at radius r for a cap angle or body height, used by shells, hairs and Min proteins.
  const capsulePoint=(r,u,around)=>{
    if(u<0){const a=-u;const rr=r*Math.sin(a);return [rr*Math.cos(around),CELL.top+r*Math.cos(a),rr*Math.sin(around)];}
    if(u>1){const a=u-1;const rr=r*Math.sin(a);return [rr*Math.cos(around),CELL.bottom-r*Math.cos(a),rr*Math.sin(around)];}
    const y=CELL.top+(CELL.bottom-CELL.top)*u,rr=r-pinch(y);return [rr*Math.cos(around),y,rr*Math.sin(around)];
  };
  const randomSurface=r=>{const area=[2*Math.PI*r*r,2*Math.PI*r*140,2*Math.PI*r*r],pick=random()*(area[0]+area[1]+area[2]),around=range(0,6.283);
    if(pick<area[0])return capsulePoint(r,-Math.acos(range(0,1)),around);if(pick<area[0]+area[1])return capsulePoint(r,random(),around);return capsulePoint(r,1+Math.acos(range(0,1)),around);};

  // Envelope shells: lathed capsules (outer membrane, wall, inner membrane) with a hole where the detailed window sits.
  for(const [r,color] of [[40,'#93cf45'],[39.02,'#e6dcbc'],[36.6,'#4fa3a8']]){
    const pts=[];for(let a=0;a<=Math.PI/2+1e-6;a+=Math.PI/48)pts.push(new THREE.Vector2(r*Math.sin(a),CELL.bottom-r*Math.cos(a)));
    for(let y=CELL.bottom+1;y<CELL.top;y+=1)pts.push(new THREE.Vector2(r-pinch(y),y));
    for(let a=Math.PI/2;a>=-1e-6;a-=Math.PI/48)pts.push(new THREE.Vector2(r*Math.sin(a),CELL.top+r*Math.cos(a)));
    const m=material(color,false,false,true);m.side=THREE.DoubleSide;envelope.add(new THREE.Mesh(new THREE.LatheGeometry(pts,160),m));
  }
  // Section rim: bilayers, wall and LPS drawn along the cut face itself (kind 16 follows the cutaway plane).
  const rim=new Beads();
  function rimLayer(r,color,spacing,depths,radius,shade=1,prob=1){
    for(const d of depths){
      for(let t=-Math.PI/2;t<=Math.PI/2;t+=spacing/r){const x=r*Math.sin(t),y=CELL.top+r*Math.cos(t);if(!(Math.abs(x)<22&&y>-15.5)&&random()<prob)rim.add([0,t,r],[d,0,0],radius*range(.9,1.1),color,-1,shade);}
      for(let y=CELL.top;y>=CELL.bottom;y-=spacing){if(random()<prob)rim.add([1,y,r],[d,0,0],radius*range(.9,1.1),color,-1,shade);if(random()<prob)rim.add([3,y,r],[d,0,0],radius*range(.9,1.1),color,-1,shade);}
      for(let t=-Math.PI/2;t<=Math.PI/2;t+=spacing/r)if(random()<prob)rim.add([2,t,r],[d,0,0],radius*range(.9,1.1),color,-1,shade);
    }
  }
  const D=[0,.12];
  rimLayer(40.09,'#f3d84e',.11,D,.045,1,.4);
  rimLayer(40,'#aaf34b',.115,D,.045);rimLayer(39.94,'#d9f3a6',.115,D,.024,.8);rimLayer(39.86,'#d9f3a6',.115,D,.022,.66);rimLayer(39.81,'#a9c97e',.115,D,.022,.66);rimLayer(39.73,'#638a41',.115,D,.046);
  rimLayer(39.02,'#efe7cc',.058,[0],.04,.9);
  rimLayer(36.85,'#a9e7dc',.115,D,.045);rimLayer(36.79,'#d3f1ea',.115,D,.024,.8);rimLayer(36.71,'#d3f1ea',.115,D,.022,.66);rimLayer(36.66,'#9fcfca',.115,D,.022,.66);rimLayer(36.58,'#639e9e',.115,D,.046);
  for(let i=0;i<2600;i++){const r=range(37.2,38.7),d=range(0,.6),color=random()<.4?'#ddbd57':'#e7cf79';const seg=[0,1,2,3][Math.floor(random()*4)],t=seg%2?range(CELL.bottom,CELL.top):range(-1.5,1.5);if(seg===0&&Math.abs(r*Math.sin(t))<22&&CELL.top+r*Math.cos(t)>-15.5)continue;for(let k=0;k<7;k++)rim.add([seg,t+(seg%2?range(-.25,.25):range(-.007,.007)),r+range(-.25,.25)],[d+range(0,.3),0,0],range(.13,.2),color,-1,range(.75,1));}
  rim.build(envelope,16);

  // Surface: LPS tufts and type 1 pili sway as hairs (kind 15).
  const fuzz=new Beads(),pili=[];
  for(let i=0;i<16000;i++){const p=randomSurface(40.1);if(p[2]>6||inSlab(...p))continue;const n=new THREE.Vector3(...p).sub(new THREE.Vector3(0,Math.min(CELL.top,Math.max(CELL.bottom,p[1])),0)).normalize(),len=range(1.2,3.4),pale=random()<.5;for(let s=0;s<len;s+=.4)fuzz.add(p,[n.x*s+range(-.1,.1),n.y*s+range(-.1,.1),n.z*s+range(-.1,.1)],.42*(1-.4*s/len),pale?'#e2eb9c':'#cfdc86',i+.5);}
  for(let i=0;i<260;i++){const p=randomSurface(40.1);if(p[2]>6||inSlab(...p))continue;const n=new THREE.Vector3(...p).sub(new THREE.Vector3(0,Math.min(CELL.top,Math.max(CELL.bottom,p[1])),0)).normalize().add(new THREE.Vector3(range(-.35,.35),range(-.35,.35),range(-.35,.35))).normalize(),len=range(25,70);pili.push(new THREE.Vector3(...p).addScaledVector(n,len*.8).toArray());for(let s=0;s<len;s+=.45)fuzz.add(p,[n.x*s,n.y*s,n.z*s],.36,s>len-1.2?'#f1f6d2':'#cfe3c0',i+.25);}
  fuzz.build(envelope,15);

  // Interior: two segregating nucleoids (random-walk DNA), ribosomes excluded from them, and the protein crowd.
  const nucleoidCenters=[[0,-72,0],[0,-138,0]],nucR=[17,26,17];
  // A thin clear slot at midcell lets the far side of the Z ring show through the section.
  const inZSlot=y=>Math.abs(y-CELL.mid)<4.5;
  const inNucleoid=(x,y,z,s=1)=>nucleoidCenters.some(c=>((x-c[0])/nucR[0])**2+((y-c[1])/nucR[1])**2+((z-c[2])/nucR[2])**2<s*s);
  // Nucleoid DNA now streams from the worker with the rest of the whole cell (double helix up close).
  // Each whole-cell molecule is a down-sampled PDB surface (12-18 beads) placed by the Brownian simulation.
  /* Whole-cell molecules now stream from the proteome (see streamer below). */
  const cellAllowed=null;

  // Division: the FtsZ ring treadmills around the pinched waist (kind 18); MinD oscillates between the poles (kind 19).
  const zRing=new Beads(),minD=new Beads();
  for(let f=0;f<80;f++){const a0=range(0,6.283),dy=range(-1.6,1.6),dr=range(-.4,.3),dir=f%2?.75:.25;for(let k=0;k<12;k++)zRing.add([a0,dy,32.4],[k*.016,range(-.08,.08),dr],range(.42,.5),k%3?'#ff8a3d':'#ff6f2b',f+dir);}
  zRing.build(proteins,18);
  for(let i=0;i<24000;i++){const p=randomSurface(36.05),isE=i%3===0;if(p[2]>6||inSlab(...p))continue;minD.add(p,[isE?1:0,0,0],range(.3,.4),isE?'#ff7aa8':i%2?'#41d3ff':'#7ae4ff');}
  minD.build(proteins,19);

  // Peritrichous flagella: each wraps over the body and pole into one helical bundle trailing above the cell (kind 17).
  const macroFlagella=new Beads(),macroMotors=new Beads(true),bundleBase=20;
  for(let f=0;f<6;f++){
    const around=f*1.047+range(-.3,.3),y0=range(-165,-55),delta=[Math.cos(f*1.047)*3.2,Math.sin(f*1.047)*3.2];
    const pts=[],add=v=>pts.push(v);
    ball(macroMotors,[Math.cos(around)*38,y0,Math.sin(around)*38],[2.4,1.3,2.4],'#ffe23a',250);
    for(let r=40;r<44;r+=.2)add([Math.cos(around)*r,y0,Math.sin(around)*r]);
    for(let y=y0;y<CELL.top;y+=.2)add([Math.cos(around)*44,y,Math.sin(around)*44]);
    for(let l=0;l<1.25;l+=.2/44)add([44*Math.cos(l)*Math.cos(around),CELL.top+44*Math.sin(l),44*Math.cos(l)*Math.sin(around)]);
    const c0=new THREE.Vector3(...pts[pts.length-1]),c1=c0.clone().add(new THREE.Vector3(-Math.cos(around)*6,10,-Math.sin(around)*6)),c2=new THREE.Vector3(delta[0],bundleBase,delta[1]);
    for(let t=.008;t<=1;t+=.008){const a=c0.clone().lerp(c1,t),b=c1.clone().lerp(c2,t);add(a.lerp(b,t).toArray());}
    let s=0;const bundleIndex=pts.length;for(let y=bundleBase+.2;y<bundleBase+320;y+=.2)add([delta[0],y,delta[1]]);
    for(let i=0;i<pts.length;i++){
      const sb=i>=bundleIndex?(i-bundleIndex)*.2+.2:-(bundleIndex-i)*.2;
      for(let k=0;k<16;k++){const a=k*.3927+i*.26;macroFlagella.add(pts[i],[Math.cos(a)*.66,0,Math.sin(a)*.66],.2,(k+i)%6<2?'#f8e6b8':'#e6c58c',sb,.74+.26*Math.cos(a+i*.15));}
    }
  }
  // The detailed filament's continuation: same bundle slot, picking up exactly where the 60-unit lattice ends.
  for(let sb=60-13.4,i=0;sb<320;sb+=.2,i++)for(let k=0;k<16;k++){const a=k*.3927+i*.26;macroFlagella.add([2.77,20+sb,1.6],[Math.cos(a)*.7,0,Math.sin(a)*.7],.21,(k+i)%6<2?'#f8e6b8':'#e6c58c',sb,.74+.26*Math.cos(a+i*.15));}
  macroFlagella.build(motor,17);macroMotors.build(motor);

  // ── Whole-cell streaming: real E. coli proteome, generated tile by tile in a worker as the camera needs it ──
  const streamer=(()=>{
    // Two kinds of tile: cut-face tiles (12×12 columns of the layer behind the cutaway) and surface tiles (12-unit cubes on the outer membrane).
    const TILE=12,NX=7,NY=19,X0=-42,Y0=-218,base=new THREE.InstancedBufferGeometry(),tiles=new Map(),inFlight=new Map();
    base.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(12),3));base.setAttribute('aMicroId',new THREE.Float32BufferAttribute([0,1,2,3],1));
    const fineMat=beadMaterial(25,true),coarseMat=beadMaterial(25,false);
    const workers=[0,1,2].map(()=>new Worker('./cellworker.js?v=15')),pending=new Map(workers.map(w=>[w,0]));let ready=false,readyCount=0,proteome=null,surfaceCubes=[];
    const send=msg=>{const w=[...pending].sort((a,b)=>a[1]-b[1])[0][0];pending.set(w,pending.get(w)+1);w.postMessage(msg);};
    const frustum=new THREE.Frustum(),pm=new THREE.Matrix4(),box=new THREE.Box3(),stats={tiles:0,surface:0,molecules:0,beads:0,requests:0};
    fetch('./cell/proteome.json').then(r=>r.json()).then(p=>{proteome=p;for(const w of workers)w.postMessage({type:'init',proteome:p});}).catch(e=>console.error('proteome',e));
    const onTile=(w,{data})=>{
      if(data.type==='ready'){if(++readyCount===workers.length)ready=true;surfaceCubes=data.surfaceCubes.map(k=>k.split(',').map(Number));metrics.dnaPoints=data.dnaPoints;return;}
      pending.set(w,Math.max(0,pending.get(w)-1));
      const slot=data.key.split('|')[0],want=inFlight.get(slot);inFlight.delete(slot);
      const geo=new THREE.InstancedBufferGeometry();geo.setAttribute('position',base.getAttribute('position'));geo.setAttribute('aMicroId',base.getAttribute('aMicroId'));
      for(const [name,key,size] of [['aCenter','center',3],['aOffset','offset',3],['aRadius','radius',1],['aColor','color',3],['aSeed','seed',1],['aShade','shade',1],['aSpecies','species',1]])geo.setAttribute(name,new THREE.InstancedBufferAttribute(data.arrays[key],size));
      geo.instanceCount=data.count;geo.setDrawRange(0,data.lod===0?4:1);
      geo.boundingSphere=sphereFor(slot);
      const mesh=new THREE.Points(geo,data.lod===0?fineMat:coarseMat);mesh.userData={streamed:true,key:data.key,molecules:data.molecules,beads:data.count,surface:data.type==='surface'};
      const old=tiles.get(slot);if(old){old.mesh.parent?.remove(old.mesh);old.mesh.geometry.dispose();}
      (data.type==='surface'?envelope:proteins).add(mesh);tiles.set(slot,{mesh,key:data.key});
      if(want&&want!==data.key)request(want);
    };
    for(const w of workers)w.onmessage=e=>onTile(w,e);
    // Slots: "c:i,j" for cut-face columns, "s:x,y,z" for surface cubes. Keys append "|detail|cut".
    function sphereFor(slot){
      const [kind,rest]=slot.split(':'),v=rest.split(',').map(Number);
      if(kind==='c')return new THREE.Sphere(new THREE.Vector3(X0+v[0]*TILE+TILE/2,Y0+v[1]*TILE+TILE/2,cutUniform.value-2.5),Math.hypot(TILE/2,TILE/2,2.5)+1.5);
      return new THREE.Sphere(new THREE.Vector3((v[0]+.5)*TILE,(v[1]+.5)*TILE,(v[2]+.5)*TILE),TILE*.87+3.5);
    }
    function request(key){
      const [slot,lodS,cutS]=key.split('|'),lod=+lodS,[kind,rest]=slot.split(':');
      inFlight.set(slot,key);stats.requests++;
      if(kind==='s'){send({type:'surface',key,cube:rest,lod});return;}
      const [i,j]=rest.split(',').map(Number),x0=X0+i*TILE,y0=Y0+j*TILE,z1=+cutS/2;
      send({type:'tile',key,x0,x1:x0+TILE,y0,y1:y0+TILE,z0:z1-5,z1,lod});
    }
    function update(){
      if(!ready)return;
      for(const t of tiles.values())t.mesh.visible=false;
      pm.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(pm);
      const cutB=Math.round(cutUniform.value*2),want=[];
      const consider=(slot,d,key)=>{const have=tiles.get(slot);if(have)have.mesh.visible=true;if(!have||have.key!==key)want.push([d,slot,key]);};
      if(proteins.visible)for(let i=0;i<NX;i++)for(let j=0;j<NY;j++){
        const x0=X0+i*TILE,y0=Y0+j*TILE;
        if(Math.abs(x0)<21.5&&Math.abs(x0+TILE)<21.5&&y0>-13.4)continue;
        box.min.set(x0,y0,cutB/2-5);box.max.set(x0+TILE,y0+TILE,cutB/2);
        if(!frustum.intersectsBox(box))continue;
        const d=box.distanceToPoint(camera.position),lod=d<10?0:d<24?1:d<70?2:3;
        consider('c:'+i+','+j,d,'c:'+i+','+j+'|'+lod+'|'+cutB);
      }
      // The exterior only needs molecular detail near the camera; farther out, the shell and LPS fuzz carry it.
      if(envelope.visible)for(const [cx,cy,cz] of surfaceCubes){
        box.min.set(cx*TILE,cy*TILE,cz*TILE);box.max.set(cx*TILE+TILE,cy*TILE+TILE,cz*TILE+TILE);
        if(box.min.z>cutUniform.value)continue;
        const d=box.distanceToPoint(camera.position);if(d>20||!frustum.intersectsBox(box))continue;
        const slot='s:'+cx+','+cy+','+cz;consider(slot,d,slot+'|'+(d<9?0:1)+'|0');
      }
      want.sort((a,b)=>a[0]-b[0]);
      for(const [,slot,key] of want){if(inFlight.has(slot)){inFlight.set(slot,key);continue;}if(inFlight.size>=9)break;request(key);}
      // Free surface tiles that are well behind the camera's reach.
      for(const [slot,t] of tiles)if(t.mesh.userData.surface&&!t.mesh.visible&&camera.position.distanceTo(t.mesh.geometry.boundingSphere.center)>90){t.mesh.parent?.remove(t.mesh);t.mesh.geometry.dispose();tiles.delete(slot);}
      stats.tiles=0;stats.surface=0;stats.molecules=0;stats.beads=0;for(const t of tiles.values())if(t.mesh.visible){t.mesh.userData.surface?stats.surface++:stats.tiles++;stats.molecules+=t.mesh.userData.molecules;stats.beads+=t.mesh.userData.beads;}
      metrics.stream={...stats};
    }
    return {update,get proteome(){return proteome;},debug:()=>[...tiles].filter(([,t])=>t.mesh.visible).map(([s,t])=>[t.key,Math.round(camera.position.distanceTo(t.mesh.geometry.boundingSphere.center))]),inflight:()=>[...inFlight.values()]};
  })();

  const macroSpecks=new Beads();
  for(let i=0;i<2600;i++)macroSpecks.add([range(-320,320),range(-420,420),range(-320,80)],[0,0,0],range(.03,.12),'#e7f2ee',range(0,120));
  macroSpecks.build(suspension,8);
  for(let i=macroStart;i<beadMeshes.length;i++)beadMeshes[i].userData.macro=true;
  metrics.macroSphereCount=beadMeshes.slice(macroStart).reduce((n,m)=>n+m.userData.fullCount,0);
  const cargo=new Beads(true),ions=new Beads(),metabolites=new Beads();
  for(let i=0;i<72;i++)ball(cargo,[0,0,0],[.13,.15,.13],i%3?'#ff9a28':'#f36a42',32,i+.17);
  cargo.build(particles,2);
  for(let i=0;i<240;i++)ions.add([0,0,0],[0,0,0],range(.025,.045),i%3?'#f9c943':'#ff73bb',i+.37);
  ions.build(particles,3);
  for(let i=0;i<540;i++)metabolites.add([range(-14,14),range(-11,1),range(-8,3)],[0,0,0],range(.025,.06),['#c4ede8','#ee87d0','#f5c84e'][i%3],range(0,100));
  metabolites.build(particles,20);
  const specks=new Beads();
  for(let i=0;i<1000;i++)specks.add([range(-25,25),i<550?range(6,28):range(-15,6),range(-18,9)],[0,0,0],range(.008,.032),'#e7f2ee',range(0,120));
  specks.build(suspension,8);metrics.suspendedParticleCount=1000;
  // Two outputs: lit color and screen-space velocity (encoded around .5) for motion blur.
  const target=new THREE.WebGLRenderTarget(1,1,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true,count:2});
  target.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
  const postScene=new THREE.Scene(),postCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const lightWorld=new THREE.Vector3(-.35,.9,1.1).normalize();
  const postMaterial=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{tColor:{value:target.textures[0]},tVel:{value:target.textures[1]},tDepth:{value:target.depthTexture},uSize:{value:new THREE.Vector2(1,1)},uProj:{value:new THREE.Vector2(1,1)},uFocus:{value:17},uAO:{value:1},uFx:{value:1},uLight:{value:new THREE.Vector3()},uNear:{value:camera.near},uFar:{value:camera.far}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`
    uniform sampler2D tColor,tDepth,tVel;uniform vec2 uSize,uProj;uniform float uAO,uNear,uFar,uFocus,uFx;uniform vec3 uLight;varying vec2 vUv;
    float depth(vec2 p){float d=texture2D(tDepth,p).r;return 2.*uNear*uFar/(uFar+uNear-(d*2.-1.)*(uFar-uNear));}
    vec3 viewPos(vec2 uv,float d){return vec3((uv*2.-1.)*uProj*d,-d);}
    // Circle of confusion: a sharp band around the orbit target, softening in front of and behind it.
    float coc(float d){return clamp((abs(d-uFocus)-uFocus*.13)/(uFocus*.6),0.,1.);}
    void main(){
      float d=depth(vUv),occ=0.,px=uSize.y/1000.,ws=max(1.,uFocus/14.);bool bg=d>uFar*.98;
      vec3 p=viewPos(vUv,d),n=normalize(cross(dFdx(p),dFdy(p)));
      vec3 col=texture2D(tColor,vUv).rgb;
      if(uFx>.5&&!bg){
        vec3 sum=col;float wsum=1.;
        for(int i=0;i<8;i++){float a=float(i)*.7854;vec2 q=vUv+vec2(cos(a),sin(a))*1.8*max(px,.7)/uSize;float w=exp(-abs(depth(q)-d)/(.045*ws));sum+=texture2D(tColor,q).rgb*w;wsum+=w;}
        col=mix(col,sum/wsum,.55);
      }
      // Depth of field: golden-angle disk gather; sharp foreground samples are rejected so they do not bleed onto blurred backgrounds.
      float c=bg?0.:coc(d);
      if(uFx>.5&&c>.03){
        vec3 sum=col;float wsum=1.,R=c*8.*px;
        for(int i=0;i<16;i++){float a=float(i)*2.39996,r=sqrt((float(i)+.5)/16.)*R;vec2 q=vUv+vec2(cos(a),sin(a))*r/uSize;float dq=depth(q);float w=(dq>d-1.5*ws||coc(dq)*8.*px>=r)?1.:0.;sum+=texture2D(tColor,q).rgb*w;wsum+=w;}
        col=sum/wsum;
      }
      // Motion blur along each pixel's velocity: the spinning rotor, stators and filament smear like the reference.
      if(uFx>.5&&!bg){
        vec2 v=(texture2D(tVel,vUv).xy-.5)/12.;float len=length(v*uSize);
        if(len>1.5){v*=min(1.,42.*px/len);vec3 s=vec3(0.);for(int i=0;i<12;i++)s+=texture2D(tColor,vUv+v*(float(i)/11.-.5)).rgb;col=mix(col,s/12.,smoothstep(1.5,5.,len));}
      }
      // Ambient occlusion: crevices between molecules darken.
      if(!bg&&uAO>.5){
        for(int i=0;i<24;i++){
          float a=float(i)*2.39996;float r=(3.+float(i%6)*6.)*max(px,.6);
          vec2 uv=clamp(vUv+vec2(cos(a),sin(a))*r/uSize,vec2(0.),vec2(1.));
          vec3 delta=viewPos(uv,depth(uv))-p;float len=length(delta);
          occ+=max(dot(n,delta/max(len,.001))-.04,0.)*(1.-smoothstep(.25*ws,2.7*ws,len));
        }
        col*=pow(max(1.-occ/24.*1.4,.25),1.05);
      }
      // Contact shadows: march toward the key light in view space and darken where nearer geometry blocks it.
      if(uFx>.5&&!bg){
        float sh=0.;
        for(int i=1;i<=10;i++){vec3 q=p+uLight*(float(i)*.1+.03)*ws;vec2 uv=(q.xy/(-q.z))/uProj*.5+.5;if(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.)break;float diff=-q.z-depth(uv);if(diff>.04*ws&&diff<.85*ws){sh=1.-float(i-1)/10.;break;}}
        col*=1.-sh*.28;
      }
      // Grade: cool shadows, warm highlights, gentle saturation lift and highlight roll-off.
      float luminance=dot(col,vec3(.2126,.7152,.0722));
      col=mix(col*vec3(.93,.98,1.07),col*vec3(1.04,1.,.95),smoothstep(.12,.7,luminance));
      luminance=dot(col,vec3(.2126,.7152,.0722));col=max(mix(vec3(luminance),col,1.12),vec3(0.))*1.03;
      float peak=max(col.r,max(col.g,col.b));col/=1.+max(peak-.85,0.)*.35;
      float vignette=1.-.14*pow(length((vUv-.5)*vec2(1.,.8)),1.5);col*=vignette;
      gl_FragColor=vec4(col,1.);
      #include <colorspace_fragment>
    }`});
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),postMaterial));

  const views={
    cell:{position:[150,-20,430],target:[0,-70,0],title:'An entire bacterium',text:'An E. coli-like rod about 2.2 µm long, cut open and caught mid-division. Its flagella bundle above the pole; the detailed window at the top is where the other views zoom in.'},
    motor:{position:[5,3,10.6],target:[1.3,-.7,.4],title:'The flagellar motor',text:'A rotary machine spanning the cell envelope. The rotor turns the shaft and external filament while its supports stay anchored.'},
    envelope:{position:[9,13,32],target:[-2,3,-2],title:'A layered boundary',text:'Two membranes and a cell-wall layer form the envelope. The space between them contains a crowded collection of proteins.'},
    interior:{position:[3,3,22],target:[-5,-4,-1],title:'A crowded interior',text:'Proteins occupy a dense, three-dimensional landscape. Their gentle drift is illustrative; this is not an atom-level physics simulation.'}
  };
  let transition=null,lodFar=false,dynScale=1,steadyFast=0;
  // Sub-bead granules only where they can be seen: chunks within ~28 units of the camera.
  const nearCamera=mesh=>{const s=mesh.geometry.boundingSphere;return camera.position.distanceTo(s.center)-s.radius<16;};
  // Detail tiers for spatial chunks: granules up close, full atoms at mid range, a third of the atoms (slightly enlarged) far away.
  function chunkTier(mesh){
    if(state.quality==='low'||lodFar)return 2;
    const s=mesh.geometry.boundingSphere,d=camera.position.distanceTo(s.center)-s.radius;
    return d<16?0:d<34?1:2;
  }
  function applyTier(mesh){
    const tier=chunkTier(mesh),fine=mesh.userData.detail&&tier===0,u=mesh.material.uniforms;
    mesh.geometry.instanceCount=tier===2?Math.ceil(mesh.userData.fullCount/3):mesh.userData.fullCount;
    mesh.geometry.setDrawRange(0,fine?4:1);u.uMicroDetail.value=fine?1:0;u.uRadiusScale.value=tier===2?1.32:1;
    return fine;
  }
  function setView(name,instant=false){
    state.view=name;const v=views[name];
    const aim=new THREE.Vector3(...v.target);if(innerWidth<=760&&name==='motor')aim.x+=1.1;
    if(instant){camera.position.fromArray(v.position);controls.target.copy(aim);controls.update();}
    else transition={from:camera.position.clone(),targetFrom:controls.target.clone(),to:new THREE.Vector3(...v.position),targetTo:aim,t:0};
    document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===name);b.setAttribute('aria-pressed',String(b.dataset.view===name));});
    $('info-title').textContent=v.title;$('info-text').textContent=v.text;
    document.querySelector('h1').textContent={cell:'An entire bacterium',motor:'The bacterial flagellar motor',envelope:'A layered, living boundary',interior:'Inside the molecular crowd'}[name];
    document.querySelector('.scene-heading p').textContent={cell:'Two micrometres of living machinery, dividing in two.',motor:'Molecular machinery, in motion.',envelope:'Two membranes. A world between them.',interior:'A dense landscape of folded proteins.'}[name];
  }
  setView('motor',true);
  function stopTour(){state.tour=false;$('tour').setAttribute('aria-pressed','false');$('tour-label').textContent='Tour';}
  controls.addEventListener('start',()=>{transition=null;stopTour();});
  let tourElapsed=0,tourIndex=0;
  const tourStops=[{view:'cell',entry:'wholecell'},{entry:'bundle'},{view:'motor',entry:'cring'},{entry:'stators'},{entry:'filament'},{view:'envelope',entry:'efflux'},{entry:'porins'},{view:'interior',entry:'rnap'},{entry:'ribosomes'},{entry:'chaperonin'},{view:'cell',entry:'zring'}];
  function goTourStop(i){
    const stop=tourStops[i];state.tourStop=i;$('tour-label').textContent='Tour '+(i+1)+'/'+tourStops.length;
    if(stop.view)setView(stop.view);
    pendingTourEntry=stop;
  }
  let pendingTourEntry=null;
  $('tour').onclick=()=>{state.tour=!state.tour;$('tour').setAttribute('aria-pressed',String(state.tour));tourElapsed=0;tourIndex=0;if(state.tour){state.paused=false;playUI();goTourStop(0);}else $('tour-label').textContent='Tour';};
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{stopTour();setView(b.dataset.view);}));
  function playUI(){$('play-text').textContent=state.paused?'Resume simulation':'Pause simulation';$('play-symbol').textContent=state.paused?'▶':'Ⅱ';$('play').setAttribute('aria-label',state.paused?'Resume simulation':'Pause simulation');$('dock-play').textContent=state.paused?'▶':'Ⅱ';$('dock-play').setAttribute('aria-label',state.paused?'Resume simulation':'Pause simulation');}
  function togglePlay(){state.paused=!state.paused;playUI();}
  $('play').onclick=togglePlay;$('dock-play').onclick=togglePlay;playUI();
  function slider(el){el.style.background=`linear-gradient(to right,var(--accent) ${(el.value-el.min)/(el.max-el.min)*100}%,#35413e 0)`;}
  for(const id of ['speed','cut'])slider($(id));
  $('speed').oninput=e=>{state.speed=+e.target.value;$('speed-value').value=state.speed.toFixed(1)+'×';slider(e.target);};
  $('cut').oninput=e=>{state.cut=+e.target.value;cutUniform.value=-3.5+state.cut*.085;$('cut-value').value=state.cut+'%';slider(e.target);};
  cutUniform.value=-3.5+state.cut*.085;
  $('reverse').onclick=()=>{state.direction*=-1;$('direction').textContent=state.direction===1?'CCW':'CW';setTumble(false);};
  for(const [id,group] of [['show-motor',motor],['show-envelope',envelope],['show-proteins',proteins],['show-particles',particles]])$(id).onchange=e=>{group.visible=e.target.checked;};
  $('ao').onchange=e=>{state.ao=e.target.checked;postMaterial.uniforms.uAO.value=state.ao?1:0;};
  $('annotations').onchange=e=>{state.labels=e.target.checked;};
  $('reset').onclick=()=>{stopTour();setView('motor');};
  function togglePanel(){document.body.classList.toggle('panel-hidden');$('toggle-panel').setAttribute('aria-expanded',String(!document.body.classList.contains('panel-hidden')));requestResize();}
  $('toggle-panel').onclick=togglePanel;
  if(innerWidth<=760){document.body.classList.add('panel-hidden');$('toggle-panel').setAttribute('aria-expanded','false');}
  document.addEventListener('keydown',e=>{if(/INPUT|SELECT|BUTTON|TEXTAREA/.test(e.target.tagName))return;if(e.code==='Space'){e.preventDefault();togglePlay();}if(e.key.toLowerCase()==='r'){stopTour();setView('motor');}if(e.key.toLowerCase()==='h')togglePanel();});
  // Resizing clears the canvas, so it only ever happens at the start of a frame, before drawing (never after one has been shown).
  let resizePending=false;const requestResize=()=>{resizePending=true;};
  function resize(){
    const bounds=$('viewport').getBoundingClientRect();heightUniform.value=bounds.height;
    const scale={low:.65,balanced:1.15,high:1.45}[state.quality]*dynScale;metrics.dynScale=+dynScale.toFixed(2);
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.5)*scale);renderer.setSize(bounds.width,bounds.height);camera.aspect=bounds.width/bounds.height;camera.fov=bounds.width<600?55:40;camera.updateProjectionMatrix();
    const size=renderer.getDrawingBufferSize(new THREE.Vector2());target.setSize(size.x,size.y);bufferHeightUniform.value=size.y;postMaterial.uniforms.uSize.value.copy(size);
    const tan=Math.tan(THREE.MathUtils.degToRad(camera.fov*.5));postMaterial.uniforms.uProj.value.set(tan*camera.aspect,tan);
    postMaterial.uniforms.uFx.value=state.quality==='low'?0:1;
    updateLOD();
  }
  // Detail levels only: no canvas or render-target changes.
  function updateLOD(){
    metrics.activeSphereCount=0;metrics.renderedSphereCount=0;
    for(const mesh of beadMeshes){if(mesh.userData.chunked){const fine=applyTier(mesh);metrics.activeSphereCount+=mesh.geometry.instanceCount;metrics.renderedSphereCount+=mesh.geometry.instanceCount*(fine?4:1);continue;}const thin=state.quality==='low'||(lodFar?!mesh.userData.macro:mesh.userData.macro),fine=mesh.userData.detail&&!thin;mesh.geometry.instanceCount=thin?Math.ceil(mesh.userData.fullCount/3):mesh.userData.fullCount;mesh.geometry.setDrawRange(0,fine?4:1);mesh.material.uniforms.uMicroDetail.value=fine?1:0;mesh.material.uniforms.uRadiusScale.value=state.quality==='low'?1.35:1;metrics.activeSphereCount+=mesh.geometry.instanceCount;metrics.renderedSphereCount+=mesh.geometry.instanceCount*(fine?4:1);}
  }
  $('quality').onchange=e=>{state.quality=e.target.value;requestResize();};window.addEventListener('resize',requestResize);resize();
  $('show-specks').onchange=e=>{suspension.visible=e.target.checked;};
  let soundPending=false;
  async function toggleSound(){
    if(soundPending)return;soundPending=true;$('toggle-sound').disabled=true;$('sound-enabled').disabled=true;
    try{await sound.setEnabled(!sound.enabled);$('sound-status').textContent=sound.enabled?'On · responds to camera distance':'Sound is off';}
    catch{$('sound-status').textContent='Audio could not start. Tap the speaker to try again.';}
    finally{soundPending=false;$('toggle-sound').disabled=false;$('sound-enabled').disabled=false;$('toggle-sound').setAttribute('aria-pressed',String(sound.enabled));$('toggle-sound').setAttribute('aria-label',sound.enabled?'Mute sound':'Enable sound');$('sound-label').textContent=sound.enabled?'Sound on':'Sound off';$('sound-enabled').checked=sound.enabled;}
  }
  $('toggle-sound').onclick=toggleSound;$('sound-enabled').onchange=toggleSound;
  slider($('volume'));$('volume').oninput=e=>{sound.volume=+e.target.value/100;$('volume-value').value=e.target.value+'%';slider(e.target);};
  const motorSource=new THREE.Vector3(2.1,-.8,.1),proteinSource=new THREE.Vector3(-4,-3,0),soundProjection=new THREE.Vector3();
  // Annotation anchors sit on the camera-facing side of each structure (motor axis at x=2.1, z=.1).
  const axis=(dx,y,dz)=>[2.1+dx,y,.1+dz],onSurf=(x,z,base,dy=0)=>[x,surf(x,z,base)+dy,z];
  const stator=.5712,frontPorin=porins.filter(p=>p[1]>.3&&Math.abs(p[0]+4)<8).sort((a,b)=>Math.abs(a[0]+6)-Math.abs(b[0]+6))[0]??porins[0];
  const anchorPoints={
    hook:axis(.35,5.95,1.02),lring:axis(.55,4.97,1.08),pring:axis(-.6,4.02,.92),rod:axis(.27,3,.12),msring:axis(.5,1.9,.55),
    cring:axis(1.25,-1.05,1.82),stators:axis(Math.cos(stator)*2.78+.25,.05,Math.sin(stator)*2.78),statorstalk:axis(Math.cos(stator)*2.78,2.1,Math.sin(stator)*2.78),
    export:axis(.55,-3.65,.5),cargo:axis(3.3,-3,.8),protons:axis(2.78,1.2,0),chey:[-1.6,-1.6,1],
    outer:onSurf(-8,1.5,5.0),lps:onSurf(-10.5,1.2,5.1,1.1),porins:onSurf(frontPorin[0],frontPorin[1],5.05),wall:onSurf(-4,1.5,4.02),periplasm:onSurf(-6.5,1,3),
    wholecell:[40.6,-128,0],proteome:[-24,-60,1.5],bundle:[0,150,0],pili:[...pili].filter(t=>t[2]<1.5&&t[1]<-60&&t[1]>-150).sort((a,b)=>b[0]-a[0])[0]??pili[0],nucleoids:[7,-72,1],ribosomezone:[-27,-155,1],zring:[33,-105,0],min:[-30,-188,1],
    rnap:[rnapSites[0][0],rnapSites[0][1]+.7,rnapSites[0][2]],chaperonin:[chaperoninSites[0][0]+.6,chaperoninSites[0][1]+.3,chaperoninSites[0][2]+.5],eftu:[ribosomeSites[2][0],ribosomeSites[2][1]+1.6,ribosomeSites[2][2]],
    inner:onSurf(9,1.6,1.85),atpsynthase:[atpSites[3][0]+.35,atpSites[3][1]-1.25,atpSites[3][2]+.35],chemoreceptors:[treeSites[0][0]+.5,surf(treeSites[0][0],treeSites[0][1],1.6)-1.8,treeSites[0][1]+.4],respiratory:receptorSites[0].slice(0,3),
    ribosomes:ribosomeSites[1],mrna:polyPath(...polysomes[0],3.5).toArray(),nascent:ribosomeSites[4].map((v,i)=>v+[-.4,-.9,.5][i]),efflux:onSurf(effluxSites[0][0]+.35,effluxSites[0][1]+.3,3.4),drugs:onSurf(effluxSites[3][0],effluxSites[3][1],5.6),crowd:[-6,-6,1.6],dna:[-7.5,-5,-.6],metabolites:[-2.2,-3.2,1.7],specks:[-7,11,3]
  };
  const groupFor={motor,envelope,proteins,particles,suspension};
  const filamentPoint=(s,out)=>{
    const sm=THREE.MathUtils.smoothstep,rot=angle,p=s-13.4,ph=.0314*p-rot*.55;
    let bx=2.77,bz=1.6;if(p>0){const c=Math.cos(ph),n=Math.sin(ph),A=14*sm(p,0,60);[bx,bz]=[c*2.77-n*1.6+Math.cos(ph)*A,n*2.77+c*1.6+Math.sin(ph)*A];}
    const w=sm(s,0,13.4),amp=1.25*sm(s,.5,6)*(1-sm(s,18,40));
    return out.set(2.1+THREE.MathUtils.lerp(0,bx-2.1,w)+amp*Math.cos(.68*s-rot),6.6+s,.1+THREE.MathUtils.lerp(0,bz-.1,w)+amp*Math.sin(.68*s-rot));};
  const anchorOf=(entry,out)=>entry.id==='filament'?filamentPoint(8,out):out.fromArray(anchorPoints[entry.id]);
  const cutExempt=new Set(['filament','hook','specks','lps','outer','drugs','bundle','pili']);
  const card=$('annot-card'),labelLayer=$('labels');labelLayer.textContent='';
  const pins=ENTRIES.map(entry=>{
    const el=document.createElement('button');el.type='button';el.className='pin';el.dataset.id=entry.id;el.setAttribute('aria-label',entry.name+': what it does');
    const dot=document.createElement('i'),name=document.createElement('span');name.textContent=entry.name;el.append(dot,name);
    el.addEventListener('click',e=>{e.stopPropagation();openEntry(entry.id,false);});labelLayer.append(el);
    return {entry,el,pos:new THREE.Vector3(),width:entry.name.length*5.6+34};
  });
  function openEntry(id,fly,keepTour=false){
    const entry=ENTRIES.find(e=>e.id===id);if(!entry)return;state.selected=id;
    $('annot-kicker').textContent=GROUPS[entry.group]+' · '+entry.kicker;$('annot-title').textContent=entry.name;$('annot-what').textContent=entry.what;
    $('annot-model').hidden=!entry.model;$('annot-model').textContent=entry.model?'In this model: '+entry.model:'';
    const list=$('annot-cites');list.textContent='';
    for(const key of entry.cites){const li=document.createElement('li'),a=document.createElement('a');a.href=CITES[key].url;a.target='_blank';a.rel='noreferrer';a.textContent=CITES[key].text;li.append(a);list.append(li);}
    if(!entry.cites.length){const li=document.createElement('li');li.className='no-cite';li.textContent='Artistic layer: no scientific source.';list.append(li);}
    card.hidden=false;document.body.classList.add('annot-open');
    for(const b of document.querySelectorAll('[data-guide]'))b.setAttribute('aria-current',String(b.dataset.guide===id));
    if(fly){
      if(!keepTour)stopTour();document.querySelector('h1').textContent=entry.name;document.querySelector('.scene-heading p').textContent=entry.kicker;const anchor=anchorOf(entry,new THREE.Vector3()),dir=camera.position.clone().sub(controls.target).normalize().lerp(new THREE.Vector3(.32,.24,1).normalize(),.55).normalize();
      transition={from:camera.position.clone(),targetFrom:controls.target.clone(),to:anchor.clone().addScaledVector(dir,entry.dist??8),targetTo:anchor,t:0};
      if(innerWidth<=760&&!document.body.classList.contains('panel-hidden'))togglePanel();
    }
  }
  // A species card built from the proteome table (PaxDb abundance, UniProt annotation, AlphaFold shape).
  function openSpecies(p,i){
    const s=p.species[i],where={cyto:'cytoplasm',im:'inner membrane',om:'outer membrane',peri:'periplasm'}[s.comp];
    state.selected=null;$('annot-kicker').textContent='Real E. coli protein · '+where+' · ~'+s.copies.toLocaleString()+' copies per cell';
    $('annot-title').textContent=(s.gene||s.acc)+' · '+s.name;
    $('annot-what').textContent=`${s.name} (${s.gene}) is ${s.len} amino acids and ${(s.mass/1000).toFixed(1)} kDa. PaxDb's integrated proteomics puts it at about ${s.copies.toLocaleString()} copies in a cell this size, and UniProt places it in the ${where}. A globular protein of this mass is roughly ${(s.r*20).toFixed(1)} nm across and diffuses at about ${s.D.toFixed(1)} µm²/s in cytoplasm.`;
    $('annot-model').hidden=false;$('annot-model').textContent='In this model: '+(s.own?'its AlphaFold structure, coarse-grained to 48 beads up close and 12 farther away.':'the shape of a similar-sized protein; its own structure is not in the downloaded set.')+' Position is sampled by abundance; it jiggles in place at a rate set by its size.';
    const list=$('annot-cites');list.textContent='';
    for(const [text,url] of [['UniProt '+s.acc+' — '+s.name,'https://www.uniprot.org/uniprotkb/'+s.acc],['AlphaFold model AF-'+s.acc+'-F1','https://alphafold.ebi.ac.uk/entry/'+s.acc],[CITES.paxdb2015.text,CITES.paxdb2015.url],[CITES.erickson2009.text,CITES.erickson2009.url]]){const li=document.createElement('li'),a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noreferrer';a.textContent=text;li.append(a);list.append(li);}
    card.hidden=false;document.body.classList.add('annot-open');
  }
  window.__micro.openSpecies=i=>streamer.proteome&&openSpecies(streamer.proteome,i);
  function closeEntry(){state.selected=null;card.hidden=true;document.body.classList.remove('annot-open');for(const b of document.querySelectorAll('[data-guide]'))b.setAttribute('aria-current','false');}
  $('annot-close').onclick=closeEntry;
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.selected)closeEntry();});
  // Field guide: every annotated structure, grouped, in the controls panel.
  const guide=$('guide-list');
  for(const [group,title] of Object.entries(GROUPS)){
    const heading=document.createElement('div');heading.className='guide-group';heading.textContent=title;guide.append(heading);
    for(const entry of ENTRIES.filter(e=>e.group===group)){const b=document.createElement('button');b.type='button';b.dataset.guide=entry.id;b.setAttribute('aria-current','false');const n=document.createElement('strong'),k=document.createElement('span');n.textContent=entry.name;k.textContent=entry.kicker;b.append(n,k);b.onclick=()=>openEntry(entry.id,true);guide.append(b);}
  }
  metrics.annotationCount=ENTRIES.length;
  // By the numbers: sourced facts about the whole cell.
  for(const fact of FACTS){const li=document.createElement('li'),v=document.createElement('strong'),t=document.createElement('span'),a=document.createElement('a');v.textContent=fact.value;t.textContent=fact.text+' ';a.href=CITES[fact.cite].url;a.target='_blank';a.rel='noreferrer';a.textContent='source';a.title=CITES[fact.cite].text;t.append(a);li.append(v,t);$('facts').append(li);}
  const projected=new THREE.Vector3(),placed=[];
  function labels(){
    const w=$('viewport').clientWidth,h=$('viewport').clientHeight,panelOpen=!document.body.classList.contains('panel-hidden')&&innerWidth>760;
    const right=panelOpen?w-335:w-10,macroView=camera.position.distanceTo(controls.target)>110;placed.length=0;let shown=0;
    // The selected pin is placed first; the rest are kept only where they do not collide.
    const order=state.selected?[...pins].sort((a,b)=>(b.entry.id===state.selected)-(a.entry.id===state.selected)):pins;
    for(const pin of order){
      const selected=pin.entry.id===state.selected;
      anchorOf(pin.entry,pin.pos);projected.copy(pin.pos).project(camera);
      const x=(projected.x*.5+.5)*w,y=(-projected.y*.5+.5)*h;
      let visible=(state.labels||selected)&&groupFor[pin.entry.layer??pin.entry.group].visible&&((pin.entry.scale==='cell')===macroView||selected)&&projected.z<1&&projected.z>-1&&x>12&&x<right-pin.width&&y>78&&y<h-150;
      if(visible&&!cutExempt.has(pin.entry.id)&&pin.pos.z>cutUniform.value+.2)visible=false;
      if(visible&&!selected&&placed.some(r=>x<r[0]+r[2]+6&&x+pin.width>r[0]-6&&Math.abs(y-r[1])<24))visible=false;
      if(visible){placed.push([x,y,pin.width]);shown++;}
      pin.el.classList.toggle('on',visible);pin.el.classList.toggle('selected',selected);pin.el.tabIndex=visible?0:-1;
      if(visible)pin.el.style.transform=`translate(${x-5}px,${y-11}px)`;
    }
    metrics.visibleAnnotations=shown;
  }
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();fail(new Error('The graphics context was interrupted. Reload to rebuild the scene, or try Performance quality.'));});
  renderer.domElement.addEventListener('webglcontextrestored',()=>location.reload());
  const slabCenter=new THREE.Vector3(0,-4,-4);
  // Click-to-identify: re-render the pixel under the pointer with species ids instead of colours.
  const pickTarget=new THREE.WebGLRenderTarget(1,1),pickPixel=new Uint8Array(4);
  function pickAt(clientX,clientY){
    const rect=renderer.domElement.getBoundingClientRect(),hidden=[];
    scene.traverse(o=>{if(o.isMesh&&o.visible&&!(o.material&&o.material.uniforms&&o.material.uniforms.uPick)){o.visible=false;hidden.push(o);}});
    const background=scene.background;scene.background=null;pickUniform.value=1;const bufferHeight=bufferHeightUniform.value;bufferHeightUniform.value=1;camera.setViewOffset(rect.width,rect.height,clientX-rect.left,clientY-rect.top,1,1);
    renderer.setRenderTarget(pickTarget);renderer.setClearColor(0x000000,1);renderer.clear();renderer.render(scene,camera);renderer.readRenderTargetPixels(pickTarget,0,0,1,1,pickPixel);renderer.setRenderTarget(null);
    camera.clearViewOffset();pickUniform.value=0;bufferHeightUniform.value=bufferHeight;scene.background=background;renderer.setClearColor(0x000000,0);for(const o of hidden)o.visible=true;
    return pickPixel[0]+pickPixel[1]*256;
  }
  let downAt=null;
  renderer.domElement.addEventListener('pointerdown',e=>{downAt=[e.clientX,e.clientY,performance.now()];});
  renderer.domElement.addEventListener('pointerup',e=>{
    if(!downAt||Math.hypot(e.clientX-downAt[0],e.clientY-downAt[1])>5||performance.now()-downAt[2]>450)return;
    const id=pickAt(e.clientX,e.clientY);if(!id)return;
    const special={65001:'ribosomezone',65002:'nucleoids',65003:'outer',65004:'lps'}[id];if(special){openEntry(special,false);return;}
    const p=streamer.proteome;if(p&&p.species[id-1])openSpecies(p,id-1);
  });
  let last=performance.now(),sample=last,frameCount=0,angle=0,omega=1.65,nextSwitch=12,tumbleUntil=-1,tumbleStart=0,holdClock=0,interacting=false,lastInteraction=performance.now(),idleClock=0;
  controls.addEventListener('start',()=>{interacting=true;holdClock=0;});controls.addEventListener('end',()=>{interacting=false;lastInteraction=performance.now();});
  function setTumble(on){
    tumbleUntil=on?1e9:-1;tumbleStart=state.time;chemo.cw=on;
    const cw=(state.direction*(on?-1:1))<0;metrics.tumbles=(metrics.tumbles||0)+(on?1:0);
    $('motor-state').classList.toggle('tumble',on);
    $('motor-state-text').textContent=on?'Tumble · CheY-P switched the motor '+(cw?'clockwise':'counterclockwise'):'Run · motor turning '+(cw?'clockwise':'counterclockwise');
  }
  $('auto-switch').onchange=e=>{state.autoSwitch=e.target.checked;if(!state.autoSwitch&&tumbleUntil>0)setTumble(false);};
  $('motor-state').onclick=()=>openEntry('cring',false);
  function frame(now){
    if(resizePending){resizePending=false;resize();}
    // Animation timestamps can precede the clock captured at start-up; never step backwards.
    const dt=Math.max(0,Math.min((now-last)/1000,.05));last=Math.max(last,now);
    const running=!state.paused&&!document.hidden;
    if(running){
      const simDt=dt*state.speed;state.time+=simDt;
      // Chemotaxis: CheY-P binding periodically flips the motor to clockwise for a brief tumble, then it returns to its run direction.
      chemo.step(simDt);
      if(state.autoSwitch&&state.time>12){if(tumbleUntil<0&&chemo.wantsCW(simDt))setTumble(true);else if(tumbleUntil>0&&state.time-tumbleStart>.8&&chemo.wantsCCW(simDt))setTumble(false);}
      // Min reaction-diffusion runs 3.5x faster than display time (model period ~104 s, seen as ~30 s).
      minSim.advance(simDt*3.5);
      {const dm=Math.max(...minSim.d),em=Math.max(...minSim.e);for(let b=0;b<100;b++){minData[b*4]=minSim.d[b]/dm;minData[b*4+1]=minSim.e[b]/em;}}
      simTexture.needsUpdate=true;
      const targetOmega=1.65*state.direction*(tumbleUntil>0?-1:1);omega+=(targetOmega-omega)*Math.min(1,simDt*8);angle+=omega*simDt;
      if(state.tour){tourElapsed+=dt;if(pendingTourEntry&&!transition){const stop=pendingTourEntry;pendingTourEntry=null;openEntry(stop.entry,!stop.view,true);}if(tourElapsed>11){tourElapsed=0;tourIndex=(tourIndex+1)%tourStops.length;goTourStop(tourIndex);}}
      // Idle camera breathes slowly around the target, like the reference's drifting shot.
      const tourHold=state.tour&&!transition;
      if(!interacting&&!transition&&(tourHold||now-lastInteraction>6000)){holdClock+=dt;idleClock+=dt;const ramp=smoother(Math.min(1,holdClock/2.5)),yaw=(tourHold?.032:.045*Math.sin(idleClock*.13))*ramp*dt;camera.position.sub(controls.target).applyAxisAngle(camera.up,yaw).multiplyScalar(tourHold?1-.006*ramp*dt:1).add(controls.target);}
    }
    shutterUniform.value=running?omega*state.speed*.09:0;
    rotor.rotation.y=angle;rotorUniform.value=angle;timeUniform.value=state.time;
    for(let i=0;i<animated.length;i++){animated[i].rotation.y=state.time*(.6+i*.13);animated[i].rotation.z=Math.sin(state.time*1.2+i)*.12;}
    metrics.rotorAngle=angle;
    if(transition){
      const tr=transition;if(!tr.dur)prepareFlight(tr);
      tr.t=Math.min(tr.t+dt/tr.dur,1);const e=smoother(tr.t);
      // Zooming in: aim first, then dive. Zooming out: pull back first, then settle on the new target.
      const aim=tr.d1<tr.d0/3?smoother(Math.min(1,tr.t*1.5)):tr.d0<tr.d1/3?smoother(Math.max(0,(tr.t-.25)/.75)):e;
      controls.target.lerpVectors(tr.targetFrom,tr.targetTo,aim);
      const dir=tr.dir0.clone().applyQuaternion(new THREE.Quaternion().slerp(tr.turn,e));
      const dist=Math.exp(THREE.MathUtils.lerp(Math.log(tr.d0),Math.log(tr.d1),e))*(1+tr.arc*Math.sin(Math.PI*e));
      camera.position.copy(controls.target).addScaledVector(dir,dist);
      if(tr.t===1){transition=null;holdClock=0;}
    }
    controls.update();const focus=camera.position.distanceTo(controls.target);postMaterial.uniforms.uFocus.value=focus;fogUniform.value.set(focus*1.4+12,focus*3.6+46);
    const far=camera.position.distanceTo(slabCenter)>150;if(far!==lodFar){lodFar=far;updateLOD();}
    if(metrics.frames%9===0){streamer.update();for(const mesh of beadMeshes)if(mesh.userData.chunked)applyTier(mesh);}
    if(metrics.frames%6===0){
      const perPx=2*focus*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/Math.max($('viewport').clientHeight,1)*10,nice=[5,10,20,50,100,200,500,1000,2000,5000].filter(n=>n/perPx<=130).pop()??5;
      $('scale-line').style.width=(nice/perPx).toFixed(1)+'px';$('scale-text').textContent=nice>=1000?nice/1000+' µm':nice+' nm';
    }
    tumbleUniform.value+=((tumbleUntil>0?1:0)-tumbleUniform.value)*Math.min(1,dt*(state.paused?0:2.5));postMaterial.uniforms.uLight.value.copy(lightWorld).transformDirection(camera.matrixWorldInverse);
    soundProjection.copy(motorSource).project(camera);
    sound.update({distance:camera.position.distanceTo(controls.target),motorDistance:camera.position.distanceTo(motorSource),motorPan:soundProjection.x,proteinDistance:camera.position.distanceTo(proteinSource),paused:state.paused,hidden:document.hidden,speed:state.speed,direction:Math.sign(omega)||state.direction,motorVisible:motor.visible&&soundProjection.z<1&&soundProjection.z>-1,proteinsVisible:proteins.visible,particlesVisible:particles.visible,time:state.time});
    renderer.setRenderTarget(target);renderer.render(scene,camera);metrics.drawCalls=renderer.info.render.calls;renderer.setRenderTarget(null);renderer.render(postScene,postCamera);labels();
    frameCount++;metrics.frames++;
    if(now-sample>1000){metrics.fps=Math.round(frameCount*1000/(now-sample));
      // Adaptive resolution: trade pixels for frame rate while the scene is running, and win them back when steady.
      if(state.adaptive&&running&&!interacting&&!transition){if(metrics.fps<55&&dynScale>.5){dynScale=Math.max(.5,dynScale*.86);steadyFast=0;requestResize();}else if(metrics.fps>=59&&dynScale<1&&++steadyFast>=3){dynScale=Math.min(1,dynScale*1.08);steadyFast=0;requestResize();}}$('fps').textContent=metrics.fps+' FPS';frameCount=0;sample=now;const seconds=Math.floor(state.time);$('clock').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');}
    if(!metrics.ready){metrics.ready=true;$('loading').classList.add('hidden');$('render-status').textContent='MOLECULAR LANDSCAPE';}
  }
  function tEase(t){return t*(3-2*t);}
  function smoother(t){return t*t*t*(t*(t*6-15)+10);}
  function prepareFlight(tr){
    tr.d0=Math.max(tr.from.distanceTo(tr.targetFrom),.5);tr.d1=Math.max(tr.to.distanceTo(tr.targetTo),.5);
    tr.dir0=tr.from.clone().sub(tr.targetFrom).normalize();const dir1=tr.to.clone().sub(tr.targetTo).normalize();tr.turn=new THREE.Quaternion().setFromUnitVectors(tr.dir0,dir1);
    const travel=tr.targetFrom.distanceTo(tr.targetTo),span=Math.max(tr.d0,tr.d1);
    tr.arc=Math.min(.45,travel/(tr.d0+tr.d1)*.6);
    tr.dur=THREE.MathUtils.clamp(1.5+.5*Math.abs(Math.log2(tr.d1/tr.d0))+.7*Math.min(travel/span,2.5),1.5,4.5);
  }
  // Live simulation charts (Min membrane profiles; CheY-P with tumble intervals), redrawn at ~8 Hz while the panel is open.
  const chartColors={minD:'#1a9ccc',minE:'#d9507f',chey:'#5aa821',grid:'#ffffff14',muted:'#82958c',text:'#dbe5d4',band:'#ffffff16'};
  const charts={min:$('chart-min'),chey:$('chart-chey')},hover={min:null,chey:null};
  function sizeCanvas(c){const r=devicePixelRatio||1,w=c.clientWidth,h=c.clientHeight;if(c.width!==Math.round(w*r)){c.width=Math.round(w*r);c.height=Math.round(h*r);}const g=c.getContext('2d');g.setTransform(r,0,0,r,0,0);return [g,w,h];}
  function drawCharts(){
    if(document.body.classList.contains('panel-hidden'))return;
    {const [g,w,h]=sizeCanvas(charts.min),pad=4;g.clearRect(0,0,w,h);g.strokeStyle=chartColors.grid;g.lineWidth=1;g.beginPath();g.moveTo(0,h-pad+.5);g.lineTo(w,h-pad+.5);g.moveTo(w/2+.5,0);g.lineTo(w/2+.5,h-pad);g.stroke();
      const dm=Math.max(...minSim.d),em=Math.max(...minSim.e);
      for(const [arr,max,color] of [[minSim.d,dm,chartColors.minD],[minSim.e,em,chartColors.minE]]){g.strokeStyle=color;g.lineWidth=2;g.lineJoin='round';g.beginPath();for(let i=0;i<arr.length;i++){const x=i/(arr.length-1)*w,y=h-pad-(arr[i]/max)*(h-pad*3);i?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();}
      if(hover.min!==null){const i=Math.round(hover.min*(minSim.n-1)),x=i/(minSim.n-1)*w;g.strokeStyle=chartColors.muted;g.lineWidth=1;g.beginPath();g.moveTo(x+.5,0);g.lineTo(x+.5,h-pad);g.stroke();$('chart-tip').textContent=(i/(minSim.n-1)*2.2).toFixed(2)+' µm from the top pole · MinD '+(minSim.d[i]/dm).toFixed(2)+' · MinE '+(minSim.e[i]/em).toFixed(2)+' of peak';}}
    {const [g,w,h]=sizeCanvas(charts.chey),pad=4,lo=1.8,hi=3.8,hist=chemo.history,toY=v=>h-pad-(v-lo)/(hi-lo)*(h-pad*2),toX=i=>w-(hist.length-1-i)/599*w;g.clearRect(0,0,w,h);
      g.fillStyle=chartColors.band;for(let i=0;i<hist.length;i++)if(hist[i][1])g.fillRect(toX(i)-w/1198,0,w/599+.5,h-pad);
      g.strokeStyle=chartColors.grid;g.beginPath();g.moveTo(0,h-pad+.5);g.lineTo(w,h-pad+.5);g.stroke();
      g.setLineDash([3,3]);g.strokeStyle=chartColors.muted;g.beginPath();g.moveTo(0,toY(chemo.k)+.5);g.lineTo(w,toY(chemo.k)+.5);g.stroke();g.setLineDash([]);
      g.fillStyle=chartColors.muted;g.font='9px Inter,Segoe UI,sans-serif';g.fillText('K = 3.1 µM',4,toY(chemo.k)-4);
      g.strokeStyle=chartColors.chey;g.lineWidth=2;g.beginPath();hist.forEach(([v],i)=>{const x=toX(i),y=toY(v);i?g.lineTo(x,y):g.moveTo(x,y);});g.stroke();
      if(hover.chey!==null&&hist.length){const i=Math.max(0,Math.min(hist.length-1,Math.round(hist.length-1-(1-hover.chey)*599))),x=toX(i);g.strokeStyle=chartColors.muted;g.lineWidth=1;g.beginPath();g.moveTo(x+.5,0);g.lineTo(x+.5,h-pad);g.stroke();$('chart-tip').textContent=((hist.length-1-i)/10).toFixed(1)+' s ago · CheY-P '+hist[i][0].toFixed(2)+' µM · '+(hist[i][1]?'tumble (clockwise)':'run');}}
    if(hover.min===null&&hover.chey===null)$('chart-tip').textContent='Hover a chart to read values.';
  }
  for(const [key,c] of Object.entries(charts)){c.addEventListener('pointermove',e=>{const r=c.getBoundingClientRect();hover[key]=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));drawCharts();});c.addEventListener('pointerleave',()=>{hover[key]=null;drawCharts();});}
  setInterval(drawCharts,125);
  renderer.setAnimationLoop(frame);
  window.__micro.setView=setView;window.__micro.streamer=streamer;
  window.__micro.flyToDir=(target,dist,d)=>{const t=new THREE.Vector3(...target),dir=new THREE.Vector3(...d).normalize();transition={from:camera.position.clone(),targetFrom:controls.target.clone(),to:t.clone().addScaledVector(dir,dist),targetTo:t,t:0};};
  window.__micro.flyTo=(target,dist)=>{const t=new THREE.Vector3(...target),dir=new THREE.Vector3(.32,.24,1).normalize();transition={from:camera.position.clone(),targetFrom:controls.target.clone(),to:t.clone().addScaledVector(dir,dist),targetTo:t,t:0};};
  window.__micro.renderer=renderer;
}
