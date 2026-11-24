import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Sigil } from "./Sigil";
import type { Deck, DomainSymbolId } from "./types";

const domainTints: Record<DomainSymbolId, string> = {
  language: "#2b193d", nordic: "#172d3f", life: "#17382f", chemistry: "#3a221f",
  physics: "#202b46", mathematics: "#30234b", astronomy: "#251b43", medicine: "#3b202e",
  computing: "#172f3a", engineering: "#3a2b1c", history: "#38281f", philosophy: "#272442", arts: "#3b203a",
};

function wrapText(context: CanvasRenderingContext2D, text: string, width: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > width && line) { lines.push(line); line = word; }
    else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

function faceTexture(tint: string, kind: "lid" | "body", text: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = kind === "lid" ? 384 : 768;
  const context = canvas.getContext("2d")!;
  context.fillStyle = tint;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const gradient = context.createRadialGradient(384, 80, 10, 384, 300, 500);
  gradient.addColorStop(0, "rgba(255,190,160,.13)");
  gradient.addColorStop(1, "rgba(4,2,10,.22)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "rgba(244,178,148,.55)";
  context.lineWidth = 2;
  context.strokeRect(58, 48, 652, canvas.height - 96);
  context.save();
  context.translate(384, canvas.height / 2);
  context.rotate(Math.PI / 4);
  const diamond = kind === "lid" ? 175 : 245;
  context.strokeRect(-diamond, -diamond, diamond * 2, diamond * 2);
  context.restore();
  context.fillStyle = "rgba(255,224,205,.94)";
  context.textAlign = "center";
  if (kind === "lid") {
    context.font = "500 42px Georgia, serif";
    const title = text.toUpperCase();
    context.fillText(title.length > 21 ? `${title.slice(0, 20)}…` : title, 384, 165);
  } else {
    context.font = "28px Arial, sans-serif";
    context.fillStyle = "rgba(226,200,207,.88)";
    const lines = wrapText(context, text, 500).slice(0, 4);
    lines.forEach((line, index) => context.fillText(line, 384, 350 + index * 38));
  }
  for (const [x, y] of [[85, 74], [683, 74], [384, canvas.height - 72]] as Array<[number, number]>) {
    context.save(); context.translate(x, y); context.rotate(Math.PI / 4); context.strokeRect(-7, -7, 14, 14); context.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function sharpBox(width: number, height: number, depth: number, color: string, front?: THREE.Texture) {
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const base = new THREE.MeshStandardMaterial({ color, roughness: .72, metalness: .16 });
  const frontMaterial = front ? new THREE.MeshStandardMaterial({ map: front, roughness: .7, metalness: .12 }) : base;
  const mesh = new THREE.Mesh(geometry, [base, base, base, base, frontMaterial, base]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: "#e99a7d", transparent: true, opacity: .7 }));
  group.add(edges);
  return group;
}

function sigilTexture(svg: SVGSVGElement, onReady: () => void) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#130b22";
  context.beginPath(); context.arc(256, 256, 240, 0, Math.PI * 2); context.fill();
  context.strokeStyle = "#e99a7d"; context.lineWidth = 9; context.stroke();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", "300"); clone.setAttribute("height", "300");
  clone.querySelectorAll("*").forEach((element) => {
    element.setAttribute("fill", "none"); element.setAttribute("stroke", "#f4b294"); element.setAttribute("stroke-width", "2.4");
    element.setAttribute("stroke-linecap", "round"); element.setAttribute("stroke-linejoin", "round");
  });
  const image = new Image();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  image.onload = () => { context.drawImage(image, 106, 106, 300, 300); texture.needsUpdate = true; onReady(); };
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
  return texture;
}

export function DeckBox3D({ deck, onStudy }: { deck: Deck; onStudy: () => void }) {
  const root = useRef<HTMLButtonElement>(null);
  const mount = useRef<HTMLSpanElement>(null);
  const renderer = useRef<THREE.WebGLRenderer | null>(null);
  const scene = useRef<THREE.Scene | null>(null);
  const camera = useRef<THREE.PerspectiveCamera | null>(null);
  const lid = useRef<THREE.Group | null>(null);
  const rotation = useRef(0);
  const animation = useRef<number | null>(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (!mount.current || !root.current) return;
    const host = mount.current;
    const nextRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    nextRenderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    nextRenderer.setClearColor(0x000000, 0);
    nextRenderer.shadowMap.enabled = true;
    nextRenderer.shadowMap.type = THREE.PCFShadowMap;
    host.appendChild(nextRenderer.domElement);
    renderer.current = nextRenderer;
    const nextScene = new THREE.Scene();
    scene.current = nextScene;
    const nextCamera = new THREE.PerspectiveCamera(34, 1, .1, 30);
    nextCamera.position.set(0, .25, 7.2);
    nextCamera.lookAt(0, .12, 0);
    camera.current = nextCamera;
    nextScene.add(new THREE.HemisphereLight(0xf7c4ad, 0x11091d, 2.1));
    const key = new THREE.DirectionalLight(0xffccb2, 3.4); key.position.set(-3, 5, 5); key.castShadow = true; nextScene.add(key);
    const rim = new THREE.PointLight(0x9f6bd0, 9, 12); rim.position.set(3, 1, -2); nextScene.add(rim);

    const tint = domainTints[deck.symbol];
    const bodyTexture = faceTexture(tint, "body", deck.description);
    const lidTexture = faceTexture(new THREE.Color(tint).offsetHSL(0, .03, .035).getStyle(), "lid", deck.name);
    const body = sharpBox(2.65, 2.45, 1.12, tint, bodyTexture); body.position.y = -.58; nextScene.add(body);
    for (let index = 0; index < 7; index += 1) {
      const card = sharpBox(2.28, .045, .82, index % 2 ? "#e5b69f" : "#d9c6ba");
      card.position.set(0, .69 + index * .052, -.02 - index * .01); card.rotation.z = (index - 3) * .004; nextScene.add(card);
    }
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, .65, -.56);
    const lidMesh = sharpBox(2.78, 1.38, 1.2, tint, lidTexture); lidMesh.position.set(0, .69, .6); lidPivot.add(lidMesh);
    const sourceSvg = root.current.querySelector(".deck-box-texture-source svg") as SVGSVGElement;
    const medallionTexture = sigilTexture(sourceSvg, () => nextRenderer.render(nextScene, nextCamera));
    medallionTexture.center.set(.5, .5);
    medallionTexture.rotation = Math.PI / 2;
    const medallionFace = new THREE.MeshStandardMaterial({ map: medallionTexture, roughness: .5, metalness: .28 });
    const medallionSide = new THREE.MeshStandardMaterial({ color: "#8f4f4d", roughness: .38, metalness: .62 });
    const medallion = new THREE.Mesh(new THREE.CylinderGeometry(.45, .45, .19, 64, 1, false), [medallionSide, medallionFace, medallionFace]);
    medallion.rotation.x = Math.PI / 2;
    medallion.position.set(0, .06, 1.295);
    medallion.castShadow = true;
    lidPivot.add(medallion);
    const medallionRim = new THREE.Mesh(new THREE.TorusGeometry(.45, .025, 12, 64), new THREE.MeshStandardMaterial({ color: "#f0a183", roughness: .3, metalness: .7, emissive: "#4b2029", emissiveIntensity: .35 }));
    medallionRim.position.set(0, .06, 1.397);
    medallionRim.castShadow = true;
    lidPivot.add(medallionRim);
    nextScene.add(lidPivot); lid.current = lidPivot;
    const base = new THREE.Mesh(new THREE.CircleGeometry(1.7, 48), new THREE.ShadowMaterial({ opacity: .28 }));
    base.rotation.x = -Math.PI / 2; base.position.set(0, -1.85, .1); base.receiveShadow = true; nextScene.add(base);

    const render = () => nextRenderer.render(nextScene, nextCamera);
    const resize = () => { const width = host.clientWidth, height = host.clientHeight; if (!width || !height) return; nextRenderer.setSize(width, height, false); nextCamera.aspect = width / height; nextCamera.updateProjectionMatrix(); render(); };
    const observer = new ResizeObserver(resize); observer.observe(host); resize();
    return () => {
      observer.disconnect(); if (animation.current) cancelAnimationFrame(animation.current);
      nextScene.traverse((object) => { if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) { object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; [...new Set(materials)].forEach((material) => material.dispose()); } });
      bodyTexture.dispose(); lidTexture.dispose(); medallionTexture.dispose(); nextRenderer.dispose(); nextRenderer.domElement.remove();
    };
  }, [deck.description, deck.name, deck.symbol]);

  useEffect(() => {
    const target = hovered ? -.72 : 0;
    if (animation.current) cancelAnimationFrame(animation.current);
    const move = () => { rotation.current += (target - rotation.current) * .14; if (lid.current) lid.current.rotation.x = rotation.current; if (renderer.current && scene.current && camera.current) renderer.current.render(scene.current, camera.current); if (Math.abs(target - rotation.current) > .002) animation.current = requestAnimationFrame(move); };
    move(); return () => { if (animation.current) cancelAnimationFrame(animation.current); };
  }, [hovered]);

  return <button ref={root} className={`deck-box-model ${hovered ? "is-hovered" : ""}`} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)} onFocus={() => setHovered(true)} onBlur={() => setHovered(false)} onClick={onStudy} aria-label={`Study ${deck.name} deck`}>
    <span className="deck-box-webgl" ref={mount} />
    <span className="deck-box-texture-source" aria-hidden="true"><Sigil symbol={deck.symbol} /></span>
  </button>;
}
