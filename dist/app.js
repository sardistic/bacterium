import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

const $ = id => document.getElementById(id);
const state = { paused: matchMedia('(prefers-reduced-motion: reduce)').matches, speed: .7, direction: 1, time: 0, cut: 65, ao: true, labels: true, view: 'motor', quality: 'balanced' };
const metrics = { ready: false, frames: 0, sphereCount: 0, drawCalls: 0, fps: 0, shaderErrors: [] };
window.__micro = { state, metrics };

function fail(error) { console.error(error); $('loading').classList.add('hidden'); $('error').hidden = false; $('error-message').textContent = error.message || String(error); }
try { await start(); } catch (error) { fail(error); }

async function start() {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.debug.onShaderError = (gl, program, vs, fs) => { const message = gl.getProgramInfoLog(program) + gl.getShaderInfoLog(vs) + gl.getShaderInfoLog(fs); metrics.shaderErrors.push(message); fail(new Error('A graphics shader could not compile. ' + message)); };
  $('viewport').append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#080f13');
  const camera = new THREE.PerspectiveCamera(40, 1, .1, 120);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = .065; controls.minDistance = 6; controls.maxDistance = 65;
  controls.maxPolarAngle = Math.PI * .86; controls.target.set(1, 1.5, 0);
  scene.add(new THREE.HemisphereLight('#d9efde', '#162b38', 2));
  const key = new THREE.DirectionalLight('#fff2c9', 3); key.position.set(-8, 15, 15); scene.add(key);
  const fill = new THREE.DirectionalLight('#8bc7dc', 1); fill.position.set(12, 0, -6); scene.add(fill);
  const proteins = new THREE.Group(), envelope = new THREE.Group(), motor = new THREE.Group(), particles = new THREE.Group();
  scene.add(proteins, envelope, motor, particles);
  const cutUniform = { value: 2.1 }, timeUniform = { value: 0 };
  const materials = [], animated = [];
  let seed = 8711;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const range = (a,b) => a + random() * (b-a);
  const palette = ['#60b7c6','#8ccfd0','#579eae','#96b9d1','#8c99c2','#c58ac1','#a861a9','#d69bc6'];
  const colorCache = new Map();
  const rgb = c => { if (!colorCache.has(c)) colorCache.set(c, new THREE.Color(c)); return colorCache.get(c); };
  const beadVertex = `
    attribute vec3 aCenter, aOffset, aColor;
    attribute float aRadius, aSeed, aShade;
    uniform float uTime;
    varying vec3 vCenter, vColor, vWorldCenter;
    varying vec2 vUv;
    varying float vRadius, vShade, vAnchorZ;
    void main(){
      float p=aSeed;
      vec3 drift=vec3(sin(uTime*.39+p),sin(uTime*.31+p*1.3),cos(uTime*.27+p))*step(0.,p)*.075;
      float angle=uTime*.045*step(0.,p)*sin(p);
      float c=cos(angle),s=sin(angle);
      vec3 off=vec3(c*aOffset.x+s*aOffset.z,aOffset.y,-s*aOffset.x+c*aOffset.z);
      vec4 world=modelMatrix*vec4(aCenter+off+drift,1.);
      vAnchorZ=(modelMatrix*vec4(aCenter+drift,1.)).z;
      vec4 center=viewMatrix*world;
      vCenter=center.xyz;vWorldCenter=world.xyz;vRadius=aRadius;vColor=aColor;vShade=aShade;
      vUv=position.xy;
      center.xy+=position.xy*aRadius*1.08;
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
      vec3 light=normalize(mat3(viewMatrix)*vec3(-.5,.9,.8));
      vec3 rough=vec3(cos(worldP.x*92.)*sin(worldP.y*83.)*sin(worldP.z*87.),sin(worldP.x*92.)*cos(worldP.y*83.)*sin(worldP.z*87.),sin(worldP.x*92.)*sin(worldP.y*83.)*cos(worldP.z*87.));
      normal=normalize(normal+mat3(viewMatrix)*rough*.27);
      float diffuse=max(dot(normal,light),0.);
      float rim=pow(1.-max(normal.z,0.),3.);
      float grain=sin(worldP.x*92.)*sin(worldP.y*83.)*sin(worldP.z*87.);
      vec3 col=vColor*(.29+.80*diffuse)*vShade*(.93+grain*.12)+vColor*.035*rim;
      float fog=smoothstep(24.,64.,-p.z);col=mix(col,vec3(.004,.009,.014),fog*.82);
      gl_FragColor=vec4(col,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;
  class Beads {
    constructor(){ this.c=[];this.o=[];this.r=[];this.colors=[];this.seeds=[];this.shades=[]; }
    add(center,offset,r,color,phase=-1,shade=1){ this.c.push(...center);this.o.push(...offset);this.r.push(r);const cc=rgb(color);this.colors.push(cc.r,cc.g,cc.b);this.seeds.push(phase);this.shades.push(shade); }
    build(parent){
      if(!this.r.length)return;
      const geo=new THREE.InstancedBufferGeometry();
      geo.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3));geo.setIndex([0,1,2,0,2,3]);
      for(const [name,arr,size] of [['aCenter',this.c,3],['aOffset',this.o,3],['aRadius',this.r,1],['aColor',this.colors,3],['aSeed',this.seeds,1],['aShade',this.shades,1]])geo.setAttribute(name,new THREE.InstancedBufferAttribute(new Float32Array(arr),size));
      geo.instanceCount=this.r.length;
      const mat=new THREE.ShaderMaterial({vertexShader:beadVertex,fragmentShader:beadFragment,uniforms:{uTime:timeUniform,uCut:cutUniform}});
      const mesh=new THREE.Mesh(geo,mat);mesh.frustumCulled=false;parent.add(mesh);materials.push(mat);metrics.sphereCount+=this.r.length;return mesh;
    }
  }
  function ball(batch, center, radii, color, count=100, phase=-1){
    const base=Math.min(...radii);
    const lobes=[{o:[0,0,0],r:base*.82}];
    for(let j=0;j<6;j++){
      const axis=Math.floor(j/2),sign=j%2?1:-1,off=[0,0,0];off[axis]=radii[axis]*.43*sign;
      lobes.push({o:off,r:base*(.61+.06*Math.sin(j*2.1))});
    }
    for(const l of lobes)batch.add(center,l.o,l.r,color,phase,.94);
    for(let i=0;i<count;i++){
      const l=lobes[i%lobes.length],y=1-2*((i*.61803398875)%1),r=Math.sqrt(1-y*y),a=i*2.399963229728653;
      const normal=[r*Math.cos(a),y,r*Math.sin(a)];
      const off=normal.map((v,j)=>l.o[j]+v*l.r*.98);
      if(lobes.some(other=>other!==l&&Math.hypot(...off.map((v,j)=>v-other.o[j]))<other.r*.96))continue;
      batch.add(center,off,base*range(.065,.10),color,phase,range(.86,1.06));
    }
  }
  function chain(batch, points, radius, color){for(const p of points)batch.add(p,[0,0,0],radius*range(.8,1.15),color);}
  function surf(x,z,base){return base-.011*x*x-.009*z*z;}
  const membraneBeads = new Beads(), wallBeads=new Beads(), periplasm=new Beads();
  for(let x=-21;x<21;x+=.19)for(let z=-12;z<4;z+=.20){
    const xx=x+range(-.06,.06),zz=z+range(-.06,.06);
    const gap=Math.hypot(xx-2.1,zz-.1)<1.15;
    if(!gap){
      membraneBeads.add([xx,surf(xx,zz,1.85),zz],[0,0,0],range(.075,.105),'#93d4d3');
      membraneBeads.add([xx,surf(xx,zz,1.60),zz],[0,0,0],.07,'#589c9f');
      membraneBeads.add([xx,surf(xx,zz,5.0),zz],[0,0,0],range(.075,.11),'#a6cc55');
      membraneBeads.add([xx,surf(xx,zz,4.75),zz],[0,0,0],.07,'#5e873e');
    }
    if(random()<.19&&!gap)wallBeads.add([xx,surf(xx,zz,4.02),zz],[0,0,0],range(.07,.11),'#c5c7a2');
  }
  for(let i=0;i<330;i++){
    const x=range(-21,21),z=range(-12,4);if(Math.hypot(x-2.1,z-.1)<2.4)continue;
    const y=surf(x,z,range(2.45,3.35));ball(periplasm,[x,y,z],[range(.25,.5),range(.22,.4),range(.25,.5)],random()<.4?'#b0a467':'#c6b06b',32);
  }
  membraneBeads.build(envelope);wallBeads.build(envelope);periplasm.build(envelope);
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
  for(let i=0;i<330;i++){
    const x=range(-21,21),z=range(-12,4);if(Math.hypot(x-2.1,z-.1)<2)continue;
    const length=range(.5,2.5),bend=range(-.4,.4),phase=range(0,7);
    for(let s=0;s<length;s+=.105){const xx=x+bend*s+Math.sin(s*3+phase)*.05;strands.add([xx,surf(x,z,5.1)+s,z+Math.sin(s*1.7+phase)*.12],[0,0,0],.055,s>length-.14?'#ded69b':'#becd75');}
  }strands.build(envelope);

  const crowd = new Beads();
  // A jittered 3D packing gives depth without expensive pairwise simulation.
  for(let ix=0;ix<30;ix++)for(let iy=0;iy<9;iy++)for(let iz=0;iz<9;iz++){
    if(random()<.24)continue;
    const x=-20+ix*1.38+range(-.3,.3),z=-11+iz*1.65+range(-.3,.3),y=-11.5+iy*1.45+range(-.3,.3);
    if(y>surf(x,z,.83))continue;
    if(Math.hypot(x-2.1,z-.1)<3.2&&y>-4.3)continue;
    const scale=range(.36,.68),col=palette[Math.floor(random()*palette.length)],phase=range(0,50);
    const radii=[scale*range(.8,1.25),scale*range(.75,1.2),scale*range(.8,1.2)];
    ball(crowd,[x,y,z],radii,col,60,phase);
    if(random()<.42)ball(crowd,[x+scale*.55,y+scale*.28,z],[scale*.64,scale*.8,scale*.7],col,30,phase);
  }
  const crowdMesh=crowd.build(proteins);

  // The hero motor has an independent rotor. Support assemblies remain anchored.
  const rotor = new THREE.Group();rotor.position.set(2.1,0,.1);motor.add(rotor);
  const fixed = new THREE.Group();fixed.position.copy(rotor.position);motor.add(fixed);
  const yellow=material('#dbb631'),gold=material('#b99c4c');
  function tube(parent,r1,r2,h,y,mat){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,72,1,true),mat);mesh.position.y=y;parent.add(mesh);return mesh;}
  function torus(parent,r,t,y,mat){const mesh=new THREE.Mesh(new THREE.TorusGeometry(r,t,12,90),mat);mesh.rotation.x=Math.PI/2;mesh.position.y=y;parent.add(mesh);return mesh;}
  tube(rotor,2.32,2.32,1.35,-1.05,yellow);torus(rotor,2.24,.17,-1.75,yellow);torus(rotor,2.24,.18,-.35,yellow);
  tube(rotor,.5,.5,6.8,2.5,gold);torus(rotor,.88,.2,1.9,yellow);torus(fixed,1.03,.22,4.02,gold);torus(fixed,1.13,.26,4.97,gold);
  const rotorBeads=new Beads(),supportBeads=new Beads();
  for(let i=0;i<92;i++){
    const a=i*Math.PI*2/92;for(let y=-1.7;y<-.28;y+=.12){rotorBeads.add([Math.cos(a)*2.31,y,Math.sin(a)*2.31],[0,0,0],range(.07,.095),'#e1c044');}
    for(let r=.58;r<2.4;r+=.14){rotorBeads.add([Math.cos(a)*r,-1.73,Math.sin(a)*r],[0,0,0],.075,'#e0c247');rotorBeads.add([Math.cos(a)*r,-.35,Math.sin(a)*r],[0,0,0],.075,'#ead061');}
  }
  for(let y=-.2;y<6.2;y+=.13)for(let a=0;a<Math.PI*2;a+=.3)rotorBeads.add([Math.cos(a+y*.8)*.5,y,Math.sin(a+y*.8)*.5],[0,0,0],.09,'#c6ac69');
  for(let i=0;i<11;i++){
    const a=i*Math.PI*2/11,x=Math.cos(a)*2.78,z=Math.sin(a)*2.78;
    ball(supportBeads,[x,.25,z],[.42,.48,.36],'#ce83b8',145);
    for(let y=.65;y<3.3;y+=.13){supportBeads.add([x,y,z],[0,0,0],.073,'#c9bc5d');supportBeads.add([x+.12,y,z],[0,0,0],.065,'#c2b452');}
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
  for(let i=0;i<190;i++){
    const p=hookCurve.getPoint(i/189);for(let j=0;j<10;j++){const a=j*Math.PI*2/10+i*.32;rotorBeads.add([p.x+Math.cos(a)*.35,p.y,p.z+Math.sin(a)*.35],[0,0,0],.065,'#d6c18c');}
  }
  rotorBeads.build(rotor);supportBeads.build(fixed);

  // Local SDF proteins: each cube bounds a blended molecular field; rays never scan the entire cell.
  const sdfVertex=`varying vec3 vLocal;void main(){vLocal=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
  const sdfFragment=`
    uniform float uTime,uCut;uniform vec3 uColor;uniform mat4 uInvModel,modelMatrix,projectionMatrix;
    varying vec3 vLocal;
    float sm(float a,float b){float h=max(.28-abs(a-b),0.)/.28;return min(a,b)-h*h*.07;}
    float field(vec3 p){
      float d=length(p*vec3(.95,1.15,1.05))-.68;
      d=sm(d,length(p-vec3(.45,.12,.12))-.43);
      d=sm(d,length(p-vec3(-.38,.15,-.14))-.46);
      d=sm(d,length(p-vec3(.05,.47,-.08))-.4);
      return d+(sin(p.x*24.)*sin(p.y*27.)*sin(p.z*23.))*.017;
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
      vec3 col=uColor*(.3+.85*l)*ao;vec4 vp=viewMatrix*vec4(wp,1.);vec4 cp=projectionMatrix*vp;gl_FragDepth=cp.z/cp.w*.5+.5;
      gl_FragColor=vec4(mix(col,vec3(.004,.009,.014),smoothstep(24.,64.,-vp.z)*.82),1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;
  for(const [x,y,z,scale] of [[-5,-.1,1.1,.8],[-7,-1,0,1],[-4,-4,2.2,.9]]){
    const mat=new THREE.ShaderMaterial({vertexShader:sdfVertex,fragmentShader:sdfFragment,uniforms:{uTime:timeUniform,uCut:cutUniform,uColor:{value:new THREE.Color('#90c953')},uInvModel:{value:new THREE.Matrix4()}}});
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(2.4,2.4,2.4),mat);mesh.position.set(x,y,z);mesh.scale.setScalar(scale);proteins.add(mesh);
    mesh.onBeforeRender=()=>{mesh.updateMatrixWorld();mat.uniforms.uInvModel.value.copy(mesh.matrixWorld).invert();};animated.push(mesh);materials.push(mat);
    const stem=new THREE.Mesh(new THREE.CylinderGeometry(.1,.1,1.2,8),material('#85b557'));stem.position.set(x,y+.8,z);proteins.add(stem);
  }

  const particleGeometry=new THREE.SphereGeometry(.105,8,6);const particleMat=material('#ed8f3d');
  const particleMesh=new THREE.InstancedMesh(particleGeometry,particleMat,46);particles.add(particleMesh);particleMesh.frustumCulled=false;
  const dummy=new THREE.Object3D();
  function updateParticles(){
    for(let i=0;i<46;i++){
      const t=(state.time*.09+i/46)%1,a=i*2.39996;
      const radius=4.7*(1-t)+.7;
      dummy.position.set(2.1+Math.cos(a+t*2)*radius,-5+3.4*t,.1+Math.sin(a+t*2)*radius);
      dummy.scale.setScalar(.65+Math.sin(t*Math.PI)*.5);dummy.updateMatrix();particleMesh.setMatrixAt(i,dummy.matrix);
    }particleMesh.instanceMatrix.needsUpdate=true;
  }
  const target=new THREE.WebGLRenderTarget(1,1,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true});
  target.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
  const postScene=new THREE.Scene(),postCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const postMaterial=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{tColor:{value:target.texture},tDepth:{value:target.depthTexture},uSize:{value:new THREE.Vector2(1,1)},uAO:{value:1},uNear:{value:camera.near},uFar:{value:camera.far}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`
    uniform sampler2D tColor,tDepth;uniform vec2 uSize;uniform float uAO,uNear,uFar;varying vec2 vUv;
    float depth(vec2 p){float d=texture2D(tDepth,p).r;return 2.*uNear*uFar/(uFar+uNear-(d*2.-1.)*(uFar-uNear));}
    void main(){
      vec3 col=texture2D(tColor,vUv).rgb;float d=depth(vUv),occ=0.;
      if(d<uFar*.98&&uAO>.5){
        for(int i=0;i<12;i++){
          float a=float(i)*2.39996;float r=4.+float(i%4)*5.;
          vec2 uv=clamp(vUv+vec2(cos(a),sin(a))*r/uSize,vec2(0.),vec2(1.));
          float diff=d-depth(uv);occ+=smoothstep(.025,.18,diff)*(1.-smoothstep(.6,1.8,diff));
        }
      }
      col*=1.-occ/12.*.85;
      float vignette=1.-.20*pow(length((vUv-.5)*vec2(1.,.8)),1.5);col*=vignette;
      gl_FragColor=vec4(col,1.);
      #include <colorspace_fragment>
    }`});
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),postMaterial));

  const views={
    motor:{position:[10,8,20],target:[.8,1.4,.2],title:'The flagellar motor',text:'A rotary machine spanning the cell envelope. The rotor turns the shaft and external filament while its supports stay anchored.'},
    envelope:{position:[9,13,32],target:[-2,3,-2],title:'A layered boundary',text:'Two membranes and a cell-wall layer form the envelope. The space between them contains a crowded collection of proteins.'},
    interior:{position:[3,3,22],target:[-5,-4,-1],title:'A crowded interior',text:'Proteins occupy a dense, three-dimensional landscape. Their gentle drift is illustrative; this is not an atom-level physics simulation.'}
  };
  let transition=null;
  function setView(name,instant=false){
    state.view=name;const v=views[name];
    if(instant){camera.position.fromArray(v.position);controls.target.fromArray(v.target);controls.update();}
    else transition={from:camera.position.clone(),targetFrom:controls.target.clone(),to:new THREE.Vector3(...v.position),targetTo:new THREE.Vector3(...v.target),t:0};
    document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===name);b.setAttribute('aria-pressed',String(b.dataset.view===name));});
    $('info-title').textContent=v.title;$('info-text').textContent=v.text;
  }
  setView('motor',true);
  controls.addEventListener('start',()=>{transition=null;});
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  function playUI(){$('play-text').textContent=state.paused?'Resume simulation':'Pause simulation';$('play-symbol').textContent=state.paused?'▶':'Ⅱ';$('play').setAttribute('aria-label',state.paused?'Resume simulation':'Pause simulation');}
  function togglePlay(){state.paused=!state.paused;playUI();}
  $('play').onclick=togglePlay;playUI();
  function slider(el){el.style.background=`linear-gradient(to right,var(--accent) ${(el.value-el.min)/(el.max-el.min)*100}%,#35413e 0)`;}
  for(const id of ['speed','cut'])slider($(id));
  $('speed').oninput=e=>{state.speed=+e.target.value;$('speed-value').value=state.speed.toFixed(1)+'×';slider(e.target);};
  $('cut').oninput=e=>{state.cut=+e.target.value;cutUniform.value=-3.5+state.cut*.085;$('cut-value').value=state.cut+'%';slider(e.target);};
  cutUniform.value=-3.5+state.cut*.085;
  $('reverse').onclick=()=>{state.direction*=-1;$('direction').textContent=state.direction===1?'CCW':'CW';};
  for(const [id,group] of [['show-motor',motor],['show-envelope',envelope],['show-proteins',proteins],['show-particles',particles]])$(id).onchange=e=>{group.visible=e.target.checked;};
  $('ao').onchange=e=>{state.ao=e.target.checked;postMaterial.uniforms.uAO.value=state.ao?1:0;};
  $('annotations').onchange=e=>{state.labels=e.target.checked;$('labels').style.display=state.labels?'':'none';};
  $('reset').onclick=()=>setView('motor');
  function togglePanel(){document.body.classList.toggle('panel-hidden');$('toggle-panel').setAttribute('aria-expanded',String(!document.body.classList.contains('panel-hidden')));resize();}
  $('toggle-panel').onclick=togglePanel;
  if(innerWidth<=760){document.body.classList.add('panel-hidden');$('toggle-panel').setAttribute('aria-expanded','false');}
  document.addEventListener('keydown',e=>{if(/INPUT|SELECT|BUTTON|TEXTAREA/.test(e.target.tagName))return;if(e.code==='Space'){e.preventDefault();togglePlay();}if(e.key.toLowerCase()==='r')setView('motor');if(e.key.toLowerCase()==='h')togglePanel();});
  function resize(){
    const bounds=$('viewport').getBoundingClientRect();
    const scale={low:.65,balanced:1,high:1.45}[state.quality];
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.5)*scale);renderer.setSize(bounds.width,bounds.height);camera.aspect=bounds.width/bounds.height;camera.fov=bounds.width<600?55:40;camera.updateProjectionMatrix();
    const size=renderer.getDrawingBufferSize(new THREE.Vector2());target.setSize(size.x,size.y);postMaterial.uniforms.uSize.value.copy(size);
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
    if(!state.paused&&!document.hidden){state.time+=dt*state.speed;angle+=dt*state.speed*state.direction*.65;}
    rotor.rotation.y=angle;timeUniform.value=state.time;
    for(let i=0;i<animated.length;i++){animated[i].rotation.y=Math.sin(state.time*.2+i)*.17;animated[i].rotation.z=Math.sin(state.time*.3+i)*.05;}
    updateParticles();
    if(transition){transition.t=Math.min(transition.t+dt/1.1,1);const t=transition.t*tEase(transition.t);camera.position.lerpVectors(transition.from,transition.to,t);controls.target.lerpVectors(transition.targetFrom,transition.targetTo,t);if(transition.t===1)transition=null;}
    controls.update();renderer.setRenderTarget(target);renderer.render(scene,camera);metrics.drawCalls=renderer.info.render.calls;renderer.setRenderTarget(null);renderer.render(postScene,postCamera);labels();
    frameCount++;metrics.frames++;
    if(now-sample>1000){metrics.fps=Math.round(frameCount*1000/(now-sample));$('fps').textContent=metrics.fps+' FPS';frameCount=0;sample=now;const seconds=Math.floor(state.time);$('clock').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');}
    if(!metrics.ready){metrics.ready=true;$('loading').classList.add('hidden');$('render-status').textContent='MOLECULAR LANDSCAPE';}
  }
  function tEase(t){return t*(3-2*t);}
  renderer.setAnimationLoop(frame);
  window.__micro.setView=setView;
  window.__micro.renderer=renderer;
}
