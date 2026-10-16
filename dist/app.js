import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

const $ = id => document.getElementById(id);
const state = { paused: matchMedia('(prefers-reduced-motion: reduce)').matches, speed: 1, direction: 1, time: 0, cut: 65, ao: true, labels: false, view: 'motor', quality: 'balanced', tour: false };
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
  const camera = new THREE.PerspectiveCamera(40, 1, .1, 120);
  camera.up.set(-.27,.963,0);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = .065; controls.minDistance = 6; controls.maxDistance = 65;
  controls.maxPolarAngle = Math.PI * .86; controls.target.set(1, 1.5, 0);
  scene.add(new THREE.HemisphereLight('#d9efde', '#162b38', 2));
  const key = new THREE.DirectionalLight('#fff2c9', 3); key.position.set(-8, 15, 15); scene.add(key);
  const fill = new THREE.DirectionalLight('#8bc7dc', 1); fill.position.set(12, 0, -6); scene.add(fill);
  const proteins = new THREE.Group(), envelope = new THREE.Group(), motor = new THREE.Group(), particles = new THREE.Group();
  scene.add(proteins, envelope, motor, particles);
  const cutUniform = { value: 2.1 }, timeUniform = { value: 0 };
  const materials = [], animated = [], beadMeshes = [];
  let seed = 8711;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const range = (a,b) => a + random() * (b-a);
  const palette = ['#51c8d6','#8cdee0','#42bacb','#5acbd3','#51b5d2','#83c9ed','#9bbbf2','#b1a7ef','#c57dd3','#ed95d6','#f2b5de','#8d63bf'];
  const colorCache = new Map();
  const rgb = c => { if (!colorCache.has(c)) colorCache.set(c, new THREE.Color(c)); return colorCache.get(c); };
  const beadVertex = `
    attribute vec3 aCenter, aOffset, aColor;
    attribute float aRadius, aSeed, aShade, aMicroId;
    uniform float uTime,uRadiusScale,uMicroDetail,uMotionKind;
    varying vec3 vCenter, vColor, vWorldCenter;
    varying vec2 vUv;
    varying float vRadius, vShade, vAnchorZ;
    void main(){
      float p=aSeed;
      float moving=step(0.,p),tm=uTime*(.65+fract(p*.173)*.65);
      vec3 drift=(vec3(sin(tm*.91+p)+.35*sin(tm*2.7+p*3.),sin(tm*.73+p*1.3)+.3*cos(tm*2.3+p),cos(tm*.81+p)+.3*sin(tm*2.1+p*2.)))*moving*.17;
      vec3 off=aOffset;
      if(uMicroDetail>.5){
        if(aMicroId>.5){float h=dot(aOffset,vec3(127.1,311.7,74.7))+aMicroId*13.47;vec3 mn=normalize(vec3(sin(h),sin(h*1.71+1.),cos(h*2.31)));off+=mn*aRadius*.65;}
      }
      float angle=tm*.42*moving*sin(p),c=cos(angle),s=sin(angle);
      off=vec3(c*off.x+s*off.z,off.y,-s*off.x+c*off.z);
      angle=tm*.26*moving*cos(p*1.7);c=cos(angle);s=sin(angle);
      off=vec3(off.x,c*off.y-s*off.z,s*off.y+c*off.z);
      off*=1.+moving*.035*sin(tm*2.+p+off.y*1.2);
      vec3 centerPos=aCenter;float life=1.;
      if(uMotionKind>.5&&uMotionKind<1.5){float h=max(aCenter.y-(5.1-.018*aCenter.x*aCenter.x-.012*aCenter.z*aCenter.z),0.);off.x+=sin(uTime*1.7+aCenter.x*.8+aCenter.z*.3)*h*.12;off.z+=cos(uTime*1.2+aCenter.x*.6)*h*.07;}
      if(uMotionKind>1.5&&uMotionKind<2.5){float q=fract(uTime*.22+p*.071),r=2.55,y=-1.25;float a=floor(p)*2.39996;if(q<.55){float t=q/.55;r=mix(5.,2.55,t);y=mix(-5.,-1.25,t);a+=sin(t*3.14159)*.7;}else if(q>.75){float t=(q-.75)/.25;r=mix(2.55,5.,t);y=mix(-1.25,-5.,t);a-=sin(t*3.14159)*.7;}centerPos=vec3(2.1+cos(a)*r,y,.1+sin(a)*r);drift*=.12;}
      if(uMotionKind>2.5&&uMotionKind<3.5){float q=fract(uTime*(.38+fract(p)*.3)+p*.137);float a=floor(p)*.5712;centerPos=vec3(2.1+cos(a)*2.78,mix(3.6,-.6,q),.1+sin(a)*2.78);drift=vec3(sin(q*17.+p),0.,cos(q*13.+p))*.04;life=smoothstep(0.,.08,q)*(1.-smoothstep(.92,1.,q));}
      if(uMotionKind>3.5&&uMotionKind<4.5){off.y+=sin(uTime*2.2+aCenter.x*2.+aCenter.z*1.3)*.022;off.x+=sin(uTime*3.+aCenter.x*3.7+aCenter.z*2.9)*.012;}
      if(uMotionKind>4.5&&uMotionKind<5.5){float a=uTime*1.3+aCenter.x*.4;c=cos(a);s=sin(a);off=vec3(c*off.x+s*off.z,off.y,-s*off.x+c*off.z);off.y+=sin(uTime*3.+aCenter.x)*.035;}
      if(uMotionKind>5.5&&aCenter.y<.8){float a=uTime*1.8+atan(aCenter.z,aCenter.x);c=cos(a);s=sin(a);off=vec3(c*off.x+s*off.z,off.y,-s*off.x+c*off.z);}
      vec4 world=modelMatrix*vec4(centerPos+off+drift,1.);
      vAnchorZ=(modelMatrix*vec4(centerPos+drift,1.)).z;
      vec4 center=viewMatrix*world;
      float microScale=uMicroDetail>.5?(aMicroId<.5?.79:.43):1.;
      vCenter=center.xyz;vWorldCenter=world.xyz;vRadius=aRadius*uRadiusScale*microScale*life;vColor=aColor;vShade=aShade;
      vUv=position.xy;
      center.xy+=position.xy*vRadius*1.08;
      gl_Position=projectionMatrix*center;
    }`;
  const beadFragment = `
    uniform float uCut;uniform mat4 projectionMatrix;
    varying vec3 vCenter,vColor,vWorldCenter;
    varying vec2 vUv;
    varying float vRadius,vShade,vAnchorZ;
    void main(){
      vec3 ray=normalize(vec3(vCenter.xy+vUv*vRadius*1.08,vCenter.z));
      float b=dot(ray,vCenter);float c=dot(vCenter,vCenter)-vRadius*vRadius;
      float h=b*b-c;if(h<0.)discard;
      float t=b-sqrt(h);if(t<=0.)discard;
      vec3 p=ray*t;vec3 normal=normalize(p-vCenter);
      vec3 worldP=(inverse(viewMatrix)*vec4(p,1.)).xyz;
      if(vAnchorZ>uCut)discard;
      vec4 clip=projectionMatrix*vec4(p,1.);gl_FragDepth=clip.z/clip.w*.5+.5;
      vec3 light=normalize(mat3(viewMatrix)*vec3(-.35,.9,1.1));
      vec3 rough=vec3(cos(worldP.x*92.)*sin(worldP.y*83.)*sin(worldP.z*87.),sin(worldP.x*92.)*cos(worldP.y*83.)*sin(worldP.z*87.),sin(worldP.x*92.)*sin(worldP.y*83.)*cos(worldP.z*87.));
      normal=normalize(normal+mat3(viewMatrix)*rough*.1);
      float diffuse=max(dot(normal,light),0.);
      float rim=pow(1.-max(normal.z,0.),3.);
      float grain=sin(worldP.x*92.)*sin(worldP.y*83.)*sin(worldP.z*87.);
      float back=max(dot(normal,normalize(mat3(viewMatrix)*vec3(.8,.4,-.4))),0.);
      vec3 col=vColor*(.32+.90*diffuse+.12*back)*mix(.69,1.,vShade)*(.98+grain*.025)+vColor*.045*rim;
      float fog=smoothstep(24.,64.,-p.z);col=mix(col,vec3(.008,.024,.036),fog*.45);
      gl_FragColor=vec4(col,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;
  class Beads {
    constructor(detail=false){ this.c=[];this.o=[];this.r=[];this.colors=[];this.seeds=[];this.shades=[];this.detail=detail; }
    add(center,offset,r,color,phase=-1,shade=1){ this.c.push(...center);this.o.push(...offset);this.r.push(r);const cc=rgb(color);this.colors.push(cc.r,cc.g,cc.b);this.seeds.push(phase);this.shades.push(shade); }
    build(parent,motionKind=0){
      if(!this.r.length)return;
      const geo=new THREE.InstancedBufferGeometry();
      const vertices=[],indices=[],microIds=[];
      for(let i=0;i<4;i++){vertices.push(-1,-1,0,1,-1,0,1,1,0,-1,1,0);indices.push(i*4,i*4+1,i*4+2,i*4,i*4+2,i*4+3);microIds.push(i,i,i,i);}
      geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setAttribute('aMicroId',new THREE.Float32BufferAttribute(microIds,1));geo.setIndex(indices);geo.setDrawRange(0,this.detail?24:6);
      for(const [name,arr,size] of [['aCenter',this.c,3],['aOffset',this.o,3],['aRadius',this.r,1],['aColor',this.colors,3],['aSeed',this.seeds,1],['aShade',this.shades,1]]){
        const data=new Float32Array(arr.length);let index=0;
        // Interleave atom subsets so lower detail thins every molecule equally.
        for(let subset=0;subset<3;subset++)for(let i=subset;i<this.r.length;i+=3)for(let j=0;j<size;j++)data[index++]=arr[i*size+j];
        geo.setAttribute(name,new THREE.InstancedBufferAttribute(data,size));
      }
      geo.instanceCount=this.r.length;
      const mat=new THREE.ShaderMaterial({vertexShader:beadVertex,fragmentShader:beadFragment,uniforms:{uTime:timeUniform,uCut:cutUniform,uRadiusScale:{value:1},uMicroDetail:{value:this.detail?1:0},uMotionKind:{value:motionKind}}});
      const mesh=new THREE.Mesh(geo,mat);mesh.frustumCulled=false;mesh.userData.fullCount=this.r.length;mesh.userData.detail=this.detail;beadMeshes.push(mesh);parent.add(mesh);materials.push(mat);metrics.sphereCount+=this.r.length;return mesh;
    }
  }
  function ball(batch, center, radii, color, count=100, phase=-1){
    const index=count>200?3:count>130?2:random()<.55?0:1;
    const atoms=templates[index].atoms;
    const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(range(0,6.28),range(0,6.28),range(0,6.28)));
    const v=new THREE.Vector3();
    const scale=Math.cbrt(radii[0]*radii[1]*radii[2])*1.45;
    for(let i=0;i<atoms.length;i+=5){
      v.set(atoms[i],atoms[i+1],atoms[i+2]).applyQuaternion(rotation);
      batch.add(center,[v.x*radii[0]*1.6,v.y*radii[1]*1.6,v.z*radii[2]*1.6],atoms[i+3]*scale*1.05,color,phase,.66+.34*atoms[i+4]);
    }
  }
  function chain(batch, points, radius, color){for(const p of points)batch.add(p,[0,0,0],radius*range(.8,1.15),color);}
  function surf(x,z,base){return base-.018*x*x-.012*z*z;}
  const membraneBeads = new Beads(), wallBeads=new Beads(), periplasm=new Beads(true);
  for(let x=-21;x<21;x+=.115)for(let z=-12;z<4;z+=.12){
    const xx=x+range(-.035,.035),zz=z+range(-.035,.035);
    const gap=Math.hypot(xx-2.1,zz-.1)<1.15;
    if(!gap){
      membraneBeads.add([xx,surf(xx,zz,1.85)+range(-.035,.035),zz],[0,0,0],range(.035,.05),'#a9e7dc');
      membraneBeads.add([xx,surf(xx,zz,1.58),zz],[0,0,0],.046,'#639e9e');
      membraneBeads.add([xx,surf(xx,zz,5.0)+range(-.035,.035),zz],[0,0,0],range(.035,.05),'#aaf34b');
      membraneBeads.add([xx,surf(xx,zz,4.73),zz],[0,0,0],.046,'#638a41');
    }
    if(random()<.45&&!gap)wallBeads.add([xx,surf(xx,zz,4.02)+range(-.045,.045),zz],[0,0,0],range(.04,.075),'#c9c7a8');
  }
  for(let i=0;i<500;i++){
    const x=range(-21,21),z=range(-12,4);if(Math.hypot(x-2.1,z-.1)<2.4)continue;
    const y=surf(x,z,range(2.45,3.35));ball(periplasm,[x,y,z],[range(.3,.55),range(.25,.45),range(.3,.55)],random()<.4?'#ddbd57':'#e7cf79',32,range(0,50));
  }
  membraneBeads.build(envelope,4);wallBeads.build(envelope);periplasm.build(envelope);
  function material(color){
    const m=new THREE.MeshStandardMaterial({color,roughness:.94,metalness:0});
    m.onBeforeCompile=shader=>{
      shader.uniforms.uCut=cutUniform;
      shader.vertexShader='varying vec3 vWorldCut;\n'+shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvWorldCut=(modelMatrix*vec4(transformed,1.)).xyz;');
      shader.fragmentShader='uniform float uCut;varying vec3 vWorldCut;\n'+shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(vWorldCut.z>uCut)discard;');
    };materials.push(m);return m;
  }
  function ribbon(base,color){
    const positions=[],indices=[];const nx=100,nz=32;
    for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){const x=-21+42*i/nx,z=-12+16*j/nz;positions.push(x,surf(x,z,base),z);}
    for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i;indices.push(a,a+nx+1,a+1,a+1,a+nx+1,a+nx+2);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();
    const m=material(color);m.side=THREE.DoubleSide;const mesh=new THREE.Mesh(g,m);envelope.add(mesh);
  }
  ribbon(1.7,'#64b1b7');ribbon(4.85,'#7e9d46');
  const strands=new Beads();
  for(let i=0;i<620;i++){
    const x=range(-21,21),z=range(-12,4);if(Math.hypot(x-2.1,z-.1)<2)continue;
    const length=range(.5,2.5),bend=range(-.4,.4),phase=range(0,7);
    for(let s=0;s<length;s+=.065){const xx=x+bend*s+Math.sin(s*3+phase)*.05;strands.add([xx,surf(x,z,5.1)+s,z+Math.sin(s*1.7+phase)*.12],[0,0,0],.037,s>length-.14?'#ded69b':'#becd75');}
    for(let j=0;j<3;j++){const height=length*range(.45,.9),side=j%2?1:-1;for(let t=0;t<.45;t+=.06)strands.add([x+bend*height+side*t*.6,surf(x,z,5.1)+height+t,z+Math.sin(height*1.7+phase)*.12+t*.3],[0,0,0],.029,'#c5d283');}
  }strands.build(envelope,1);

  const crowd = new Beads(true);
  // Rejection packing prevents the visible rows and repeated spacing of a grid.
  const packing=new Map();
  for(let attempt=0;attempt<10500;attempt++){
    const x=range(-20,20),z=range(-11,3.8),y=range(-13,1.2);
    if(y>surf(x,z,.83))continue;
    if(Math.hypot(x-2.1,z-.1)<2.95&&y>-4.1)continue;
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
  const crowdMesh=crowd.build(proteins);

  // The hero motor has an independent rotor. Support assemblies remain anchored.
  const rotor = new THREE.Group();rotor.position.set(2.1,0,.1);motor.add(rotor);
  const fixed = new THREE.Group();fixed.position.copy(rotor.position);motor.add(fixed);
  const yellow=material('#f2dc20'),gold=material('#e4bf83');
  function tube(parent,r1,r2,h,y,mat){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,72,1,true),mat);mesh.position.y=y;parent.add(mesh);return mesh;}
  function torus(parent,r,t,y,mat){const mesh=new THREE.Mesh(new THREE.TorusGeometry(r,t,12,90),mat);mesh.rotation.x=Math.PI/2;mesh.position.y=y;parent.add(mesh);return mesh;}
  tube(rotor,2.32,2.32,1.35,-1.05,yellow);torus(rotor,2.24,.17,-1.75,yellow);torus(rotor,2.24,.18,-.35,yellow);
  tube(rotor,.27,.27,6.8,2.5,gold);torus(rotor,.72,.16,1.9,yellow);torus(fixed,1.03,.22,4.02,gold);torus(fixed,1.13,.26,4.97,gold);
  const rotorBeads=new Beads(),supportBeads=new Beads(true);
  for(let i=0;i<34;i++){
    const a=i*Math.PI*2/34;
    ball(rotorBeads,[Math.cos(a)*2.28,-1.04,Math.sin(a)*2.28],[.25,.68,.25],'#ffe928',65);
    for(let t=0;t<1;t+=.035){const r=1.83+t*.54;rotorBeads.add([Math.cos(a)*r,-.27+Math.sin(t*Math.PI)*.045,Math.sin(a)*r],[0,0,0],.031,'#fff34d');}
  }
  for(let i=0;i<9;i++){
    const a=i*Math.PI*2/9;
    for(let t=0;t<1;t+=.016){const r=.25+t*1.65;rotorBeads.add([Math.cos(a+t*.13)*r,-1.15+t*.48,Math.sin(a+t*.13)*r],[0,0,0],.035,'#efc92a');}
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
  for(let y=-1;y<6.2;y+=.055)for(let a=0;a<Math.PI*2;a+=.15)rotorBeads.add([Math.cos(a+y*.8)*.275,y,Math.sin(a+y*.8)*.275],[0,0,0],.034,'#cbb478');
  function coatRing(batch,r,t,y,color){
    for(let i=0;i<6500;i++){const a=range(0,6.283),b=range(0,6.283),rr=r+Math.cos(b)*t;batch.add([Math.cos(a)*rr,y+Math.sin(b)*t,Math.sin(a)*rr],[0,0,0],range(.025,.042),color);}
  }
  coatRing(rotorBeads,2.24,.17,-1.75,'#e1c42e');coatRing(rotorBeads,2.24,.18,-.35,'#e5cb3d');coatRing(supportBeads,1.03,.22,4.02,'#c5ad72');coatRing(supportBeads,1.13,.26,4.97,'#d6bd86');coatRing(rotorBeads,.72,.16,1.9,'#ddc34a');
  for(let i=0;i<11;i++){
    const a=i*Math.PI*2/11,x=Math.cos(a)*2.78,z=Math.sin(a)*2.78;
    ball(supportBeads,[x,.05,z],[.40,.51,.36],'#ef8fcd',145);
    for(let y=.65;y<3.3;y+=.055){supportBeads.add([x,y,z],[0,0,0],.037,'#c9bc5d');supportBeads.add([x+.075,y,z],[0,0,0],.034,'#c2b452');}
    ball(supportBeads,[x,3.25,z],[.3,.24,.3],'#d5bd65',65);
  }
  ball(rotorBeads,[0,-3.65,0],[.62,.4,.62],'#d77b33',250);
  for(let i=0;i<7;i++){
    const a=i*Math.PI*2/7;const points=[];
    for(let t=0;t<1;t+=.045)points.push([Math.cos(a)*(.45+t*1.6),-3.5+t*1.8,Math.sin(a)*(.45+t*1.6)]);
    chain(rotorBeads,points,.065,'#bd9c40');
  }
  const hookPoints=[];for(let i=0;i<=100;i++){const t=i/100;hookPoints.push(new THREE.Vector3(Math.sin(t*3.1)*.85,6+t*8.5,Math.sin(t*4)*.4));}
  const hookCurve=new THREE.CatmullRomCurve3(hookPoints);
  const hook=new THREE.Mesh(new THREE.TubeGeometry(hookCurve,150,.35,12,false),material('#c8b37a'));rotor.add(hook);
  for(let i=0;i<350;i++){
    const p=hookCurve.getPoint(i/349);for(let j=0;j<32;j++){const a=j*Math.PI*2/32+i*.32;rotorBeads.add([p.x+Math.cos(a)*.35,p.y,p.z+Math.sin(a)*.35],[0,0,0],range(.023,.037),'#d6c18c');}
  }
  rotorBeads.build(rotor);supportBeads.build(fixed,6);

  const machinery=new Beads(true);
  for(const [x,z] of [[-8,1],[-10,-2],[8,-1],[11,-4]]){
    const y=surf(x,z,1.6);
    ball(machinery,[x,y-.3,z],[.36,.32,.4],'#69c7b2',145);
    for(let arm=0;arm<6;arm++){
      const a=arm*Math.PI/3;
      for(let j=0;j<6;j++){const t=j/5;ball(machinery,[x+Math.cos(a)*(.15+t*.35),y-.45-t*2.8,z+Math.sin(a)*(.15+t*.35)],[.13,.35,.13],'#71c4b5',32);}
    }
    ball(machinery,[x,y-3.5,z],[.6,.48,.65],'#66b7ae',210);
  }machinery.build(proteins,5);

  // Coiled nucleic-acid-like strands provide a second scale of structure.
  const coils=new Beads();
  for(let strand=0;strand<5;strand++){
    const origin=[-7-strand*.85,-5-strand*.6,-1-strand*.8],phase=range(0,40);
    for(let j=0;j<1200;j++){
      const t=j*.023;
      const p=[origin[0]+Math.sin(t*.6+strand)*2.3+Math.sin(t*2.3)*.35,origin[1]+Math.cos(t*.49)*1.5+Math.sin(t*2.7)*.3,origin[2]+Math.sin(t*.71)*1.2];
      coils.add(origin,p.map((v,k)=>v-origin[k]),.027,j%20<10?'#edbd32':'#e9a83a',phase);
    }
  }coils.build(proteins);

  // Local SDF proteins: each cube bounds a blended molecular field; rays never scan the entire cell.
  const sdfVertex=`varying vec3 vLocal;void main(){vLocal=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
  const sdfFragment=`
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
      gl_FragColor=vec4(mix(col,vec3(.008,.024,.036),smoothstep(24.,64.,-vp.z)*.45),1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;
  for(const [x,y,z,scale] of [[-5,-.1,1.1,.5],[-7,-1,0,.6],[-4,-4,2.2,.55]]){
    const mat=new THREE.ShaderMaterial({vertexShader:sdfVertex,fragmentShader:sdfFragment,uniforms:{uTime:timeUniform,uCut:cutUniform,uColor:{value:new THREE.Color('#8ce62c')},uInvModel:{value:new THREE.Matrix4()}}});
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(2.4,2.4,2.4),mat);mesh.position.set(x,y,z);mesh.scale.setScalar(scale);proteins.add(mesh);
    mesh.onBeforeRender=()=>{mesh.updateMatrixWorld();mat.uniforms.uInvModel.value.copy(mesh.matrixWorld).invert();};animated.push(mesh);materials.push(mat);
    const stem=new THREE.Mesh(new THREE.CylinderGeometry(.1,.1,1.2,8),material('#85b557'));stem.position.set(x,y+.8,z);proteins.add(stem);
  }

  const cargo=new Beads(true),ions=new Beads(),metabolites=new Beads();
  for(let i=0;i<72;i++)ball(cargo,[0,0,0],[.13,.15,.13],i%3?'#ff9a28':'#f36a42',32,i+.17);
  cargo.build(particles,2);
  for(let i=0;i<240;i++)ions.add([0,0,0],[0,0,0],range(.025,.045),i%3?'#f9c943':'#ff73bb',i+.37);
  ions.build(particles,3);
  for(let i=0;i<540;i++)metabolites.add([range(-14,14),range(-11,1),range(-8,3)],[0,0,0],range(.025,.06),['#c4ede8','#ee87d0','#f5c84e'][i%3],range(0,100));
  metabolites.build(particles);
  const target=new THREE.WebGLRenderTarget(1,1,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true});
  target.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
  const postScene=new THREE.Scene(),postCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const postMaterial=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{tColor:{value:target.texture},tDepth:{value:target.depthTexture},uSize:{value:new THREE.Vector2(1,1)},uProj:{value:new THREE.Vector2(1,1)},uFocus:{value:17},uAO:{value:1},uNear:{value:camera.near},uFar:{value:camera.far}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`
    uniform sampler2D tColor,tDepth;uniform vec2 uSize,uProj;uniform float uAO,uNear,uFar,uFocus;varying vec2 vUv;
    float depth(vec2 p){float d=texture2D(tDepth,p).r;return 2.*uNear*uFar/(uFar+uNear-(d*2.-1.)*(uFar-uNear));}
    vec3 viewPos(vec2 uv,float d){return vec3((uv*2.-1.)*uProj*d,-d);}
    void main(){
      vec3 col=texture2D(tColor,vUv).rgb;float d=depth(vUv),occ=0.;
      vec3 p=viewPos(vUv,d),n=normalize(cross(dFdx(p),dFdy(p)));
      if(d<uFar*.98&&uAO>.5){
        for(int i=0;i<24;i++){
          float a=float(i)*2.39996;float r=4.+float(i%6)*6.;
          vec2 uv=clamp(vUv+vec2(cos(a),sin(a))*r/uSize,vec2(0.),vec2(1.));
          vec3 delta=viewPos(uv,depth(uv))-p;float len=length(delta);
          occ+=max(dot(n,delta/max(len,.001))-.04,0.)*(1.-smoothstep(.25,2.7,len));
        }
      }
      float blur=clamp((d-uFocus-2.)/11.,0.,1.)*.6;
      if(blur>.1){vec3 sum=col;float weight=1.;for(int j=0;j<6;j++){float a=float(j)*1.0472;vec2 q=vUv+vec2(cos(a),sin(a))*blur/uSize;float w=step(abs(depth(q)-d),1.);sum+=texture2D(tColor,q).rgb*w;weight+=w;}col=sum/weight;}
      col*=pow(max(1.-occ/24.*1.4,.25),1.05);
      float luminance=dot(col,vec3(.2126,.7152,.0722));col=max(mix(vec3(luminance),col,1.14),vec3(0.))*1.02;
      float peak=max(col.r,max(col.g,col.b));col/=1.+max(peak-.85,0.)*.35;
      float vignette=1.-.12*pow(length((vUv-.5)*vec2(1.,.8)),1.5);col*=vignette;
      gl_FragColor=vec4(col,1.);
      #include <colorspace_fragment>
    }`});
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),postMaterial));

  const views={
    motor:{position:[5,3,10.6],target:[1.3,-.7,.4],title:'The flagellar motor',text:'A rotary machine spanning the cell envelope. The rotor turns the shaft and external filament while its supports stay anchored.'},
    envelope:{position:[9,13,32],target:[-2,3,-2],title:'A layered boundary',text:'Two membranes and a cell-wall layer form the envelope. The space between them contains a crowded collection of proteins.'},
    interior:{position:[3,3,22],target:[-5,-4,-1],title:'A crowded interior',text:'Proteins occupy a dense, three-dimensional landscape. Their gentle drift is illustrative; this is not an atom-level physics simulation.'}
  };
  let transition=null;
  function setView(name,instant=false){
    state.view=name;const v=views[name];
    const aim=new THREE.Vector3(...v.target);if(innerWidth<=760&&name==='motor')aim.x+=1.1;
    if(instant){camera.position.fromArray(v.position);controls.target.copy(aim);controls.update();}
    else transition={from:camera.position.clone(),targetFrom:controls.target.clone(),to:new THREE.Vector3(...v.position),targetTo:aim,t:0};
    document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===name);b.setAttribute('aria-pressed',String(b.dataset.view===name));});
    $('info-title').textContent=v.title;$('info-text').textContent=v.text;
    document.querySelector('h1').textContent={motor:'The bacterial flagellar motor',envelope:'A layered, living boundary',interior:'Inside the molecular crowd'}[name];
    document.querySelector('.scene-heading p').textContent={motor:'Molecular machinery, in motion.',envelope:'Two membranes. A world between them.',interior:'A dense landscape of folded proteins.'}[name];
  }
  setView('motor',true);
  function stopTour(){state.tour=false;$('tour').setAttribute('aria-pressed','false');}
  controls.addEventListener('start',()=>{transition=null;stopTour();});
  let tourElapsed=0,tourIndex=0;
  $('tour').onclick=()=>{state.tour=!state.tour;$('tour').setAttribute('aria-pressed',String(state.tour));tourElapsed=0;tourIndex=0;if(state.tour){state.paused=false;playUI();setView('motor');}};
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{stopTour();setView(b.dataset.view);}));
  function playUI(){$('play-text').textContent=state.paused?'Resume simulation':'Pause simulation';$('play-symbol').textContent=state.paused?'▶':'Ⅱ';$('play').setAttribute('aria-label',state.paused?'Resume simulation':'Pause simulation');$('dock-play').textContent=state.paused?'▶':'Ⅱ';$('dock-play').setAttribute('aria-label',state.paused?'Resume simulation':'Pause simulation');}
  function togglePlay(){state.paused=!state.paused;playUI();}
  $('play').onclick=togglePlay;$('dock-play').onclick=togglePlay;playUI();
  function slider(el){el.style.background=`linear-gradient(to right,var(--accent) ${(el.value-el.min)/(el.max-el.min)*100}%,#35413e 0)`;}
  for(const id of ['speed','cut'])slider($(id));
  $('speed').oninput=e=>{state.speed=+e.target.value;$('speed-value').value=state.speed.toFixed(1)+'×';slider(e.target);};
  $('cut').oninput=e=>{state.cut=+e.target.value;cutUniform.value=-3.5+state.cut*.085;$('cut-value').value=state.cut+'%';slider(e.target);};
  cutUniform.value=-3.5+state.cut*.085;
  $('reverse').onclick=()=>{state.direction*=-1;$('direction').textContent=state.direction===1?'CCW':'CW';};
  for(const [id,group] of [['show-motor',motor],['show-envelope',envelope],['show-proteins',proteins],['show-particles',particles]])$(id).onchange=e=>{group.visible=e.target.checked;};
  $('ao').onchange=e=>{state.ao=e.target.checked;postMaterial.uniforms.uAO.value=state.ao?1:0;};
  $('annotations').onchange=e=>{state.labels=e.target.checked;$('labels').style.display=state.labels?'block':'none';};
  $('reset').onclick=()=>{stopTour();setView('motor');};
  function togglePanel(){document.body.classList.toggle('panel-hidden');$('toggle-panel').setAttribute('aria-expanded',String(!document.body.classList.contains('panel-hidden')));resize();}
  $('toggle-panel').onclick=togglePanel;
  if(innerWidth<=760){document.body.classList.add('panel-hidden');$('toggle-panel').setAttribute('aria-expanded','false');}
  document.addEventListener('keydown',e=>{if(/INPUT|SELECT|BUTTON|TEXTAREA/.test(e.target.tagName))return;if(e.code==='Space'){e.preventDefault();togglePlay();}if(e.key.toLowerCase()==='r'){stopTour();setView('motor');}if(e.key.toLowerCase()==='h')togglePanel();});
  function resize(){
    const bounds=$('viewport').getBoundingClientRect();
    const scale={low:.65,balanced:1.15,high:1.45}[state.quality];
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.5)*scale);renderer.setSize(bounds.width,bounds.height);camera.aspect=bounds.width/bounds.height;camera.fov=bounds.width<600?55:40;camera.updateProjectionMatrix();
    const size=renderer.getDrawingBufferSize(new THREE.Vector2());target.setSize(size.x,size.y);postMaterial.uniforms.uSize.value.copy(size);
    const tan=Math.tan(THREE.MathUtils.degToRad(camera.fov*.5));postMaterial.uniforms.uProj.value.set(tan*camera.aspect,tan);
    metrics.activeSphereCount=0;metrics.renderedSphereCount=0;
    for(const mesh of beadMeshes){const fine=mesh.userData.detail&&state.quality!=='low';mesh.geometry.instanceCount=state.quality==='low'?Math.ceil(mesh.userData.fullCount/3):mesh.userData.fullCount;mesh.geometry.setDrawRange(0,fine?24:6);mesh.material.uniforms.uMicroDetail.value=fine?1:0;mesh.material.uniforms.uRadiusScale.value=state.quality==='low'?1.35:1;metrics.activeSphereCount+=mesh.geometry.instanceCount;metrics.renderedSphereCount+=mesh.geometry.instanceCount*(fine?4:1);}
  }
  $('quality').onchange=e=>{state.quality=e.target.value;resize();};window.addEventListener('resize',resize);resize();
  const anchors={motor:new THREE.Vector3(4.9,-1.3,1.4),outer:new THREE.Vector3(-8,4.5,1.5),inner:new THREE.Vector3(9,.7,1.6),cyto:new THREE.Vector3(-6,-6,2)};
  const projected=new THREE.Vector3();
  function labels(){
    const w=$('viewport').clientWidth,h=$('viewport').clientHeight;
    for(const el of document.querySelectorAll('[data-anchor]')){
      const name=el.dataset.anchor;projected.copy(anchors[name]).project(camera);
      const x=(projected.x*.5+.5)*w,y=(-projected.y*.5+.5)*h;
      const visible=state.labels&&projected.z<1&&projected.z>-1&&x>15&&x<w-145&&y>240&&y<h-70&&(name==='motor'?motor.visible:name==='cyto'?proteins.visible:envelope.visible);
      el.style.opacity=visible?'1':'0';el.style.transform=`translate(${x}px,${y}px)`;
    }
  }
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();fail(new Error('The graphics context was interrupted. Reload to rebuild the scene, or try Performance quality.'));});
  renderer.domElement.addEventListener('webglcontextrestored',()=>location.reload());
  let last=performance.now(),sample=last,frameCount=0,angle=0;
  function frame(now){
    const dt=Math.min((now-last)/1000,.05);last=now;
    if(!state.paused&&!document.hidden){state.time+=dt*state.speed;angle+=dt*state.speed*state.direction*1.65;if(state.tour){tourElapsed+=dt;if(tourElapsed>11){tourElapsed=0;tourIndex=(tourIndex+1)%3;setView(['motor','envelope','interior'][tourIndex]);}}}
    rotor.rotation.y=angle;timeUniform.value=state.time;
    for(let i=0;i<animated.length;i++){animated[i].rotation.y=state.time*(.6+i*.13);animated[i].rotation.z=Math.sin(state.time*1.2+i)*.12;}
    metrics.rotorAngle=angle;
    if(transition){transition.t=Math.min(transition.t+dt/1.1,1);const t=transition.t*tEase(transition.t);camera.position.lerpVectors(transition.from,transition.to,t);controls.target.lerpVectors(transition.targetFrom,transition.targetTo,t);if(transition.t===1)transition=null;}
    controls.update();postMaterial.uniforms.uFocus.value=camera.position.distanceTo(controls.target);renderer.setRenderTarget(target);renderer.render(scene,camera);metrics.drawCalls=renderer.info.render.calls;renderer.setRenderTarget(null);renderer.render(postScene,postCamera);labels();
    frameCount++;metrics.frames++;
    if(now-sample>1000){metrics.fps=Math.round(frameCount*1000/(now-sample));$('fps').textContent=metrics.fps+' FPS';frameCount=0;sample=now;const seconds=Math.floor(state.time);$('clock').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');}
    if(!metrics.ready){metrics.ready=true;$('loading').classList.add('hidden');$('render-status').textContent='MOLECULAR LANDSCAPE';}
  }
  function tEase(t){return t*(3-2*t);}
  renderer.setAnimationLoop(frame);
  window.__micro.setView=setView;
  window.__micro.renderer=renderer;
}
