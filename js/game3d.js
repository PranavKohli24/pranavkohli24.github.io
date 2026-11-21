import * as THREE from 'three';

/*
 * Escape the Interview · 3D visual layer
 * 3D side-scrolling environment, character and interview-themed props,
 * and 3D versions of the existing obstacles / collectibles.
 * Game rules and collision detection remain in the original game.js.
 */

(() => {
    'use strict';

    const canvas = document.getElementById('game3dCanvas');
    const wrap = document.querySelector('.game-canvas-wrap');
    if (!canvas || !wrap) return;

    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: window.devicePixelRatio <= 1.5,
            alpha: false,
            preserveDrawingBuffer: true,
            powerPreference: 'high-performance'
        });
    } catch (error) {
        canvas.style.display = 'none';
        console.warn('[Escape the Interview] WebGL unavailable. Keeping the 2D renderer.', error);
        return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8a93a0);
    scene.fog = new THREE.Fog(0x8a93a0, 22, 62);

    const camera = new THREE.OrthographicCamera(-10, 10, 5, -5, 0.1, 120);
    camera.position.set(0, 0, 32);
    camera.lookAt(0, 0, 0);

    const clock = new THREE.Clock();
    const environment = new THREE.Group();
    const worldItems = new THREE.Group();
    const characterLayer = new THREE.Group();
    scene.add(environment, worldItems, characterLayer);

    const obstacleMeshes = new Map();
    const coinMeshes = new Map();
    const powerMeshes = new Map();
    const doorMeshes = new Map();

    let currentLayout = '';
    let layout = null;
    let player = null;
    let playerShadow = null;
    let shieldVisual = null;
    let groundMarkers = [];
    let ambientLight;
    let keyLight;
    let fillLight;
    let skyMesh;
    let skyMaterial;
    let roadMaterial;
    let curbMaterial;
    let roadSheenMaterial;
    let activeThemeIndex = -1;
    let buildingMaterials = [];
    let windowMaterials = [];
    let lampMaterials = [];
    let sceneryTracks = [];

    // The four original rounds keep their own time-of-day identity.
    // Palette kept deliberately muted and desaturated versus before — a
    // bright pastel sky was competing with the runner for attention. Fog
    // starts closer so distant buildings recede instead of glowing.
    const ROUND_THEMES = [
        {
            name: 'Morning',
            // Clear, cool dawn with a soft warm band at the horizon — bright
            // enough to read easily, muted enough not to fight the runner.
            skyTop: '#6f83a0', skyMid: '#a3b0bc', horizon: '#dcbb8a',
            fog: '#9aa1a8', background: '#8f9aa6',
            hemi: '#d7dee3', groundLight: '#4a4951', sunlight: '#f0dcae',
            sunIntensity: 1.4, buildingTint: '#9aa0a6', road: '#6b7379',
            curb: '#8b8d89', sheen: '#a08e78', windowGlow: 0.14,
            lampGlow: 0.06, stars: false, solarX: 0.76, solarY: 0.70,
            solarColor: '#f8e4b8', solarRadius: 38,
            fogNear: 20, fogFar: 60
        },
        {
            name: 'Afternoon',
            // Clear, naturally bright daylight — believable sky, not candy blue.
            skyTop: '#4a76a0', skyMid: '#8eacc0', horizon: '#d7c79a',
            fog: '#95a0a6', background: '#7a95a8',
            hemi: '#e0e8ec', groundLight: '#4f4e47', sunlight: '#f6e9c4',
            sunIntensity: 1.7, buildingTint: '#979c93', road: '#6e767c',
            curb: '#86877f', sheen: '#ac9c76', windowGlow: 0.06,
            lampGlow: 0.03, stars: false, solarX: 0.78, solarY: 0.35,
            solarColor: '#faf0ce', solarRadius: 52,
            fogNear: 22, fogFar: 64
        },
        {
            name: 'Evening',
            // Golden hour: a clearly warm sun against a cooling upper sky.
            skyTop: '#304564', skyMid: '#82657a', horizon: '#d49868',
            fog: '#746b78', background: '#555f74',
            hemi: '#9c97a8', groundLight: '#33333c', sunlight: '#f0ac82',
            sunIntensity: 1.3, buildingTint: '#878390', road: '#656b74',
            curb: '#616670', sheen: '#a17771', windowGlow: 0.62,
            lampGlow: 0.52, stars: false, solarX: 0.78, solarY: 0.70,
            solarColor: '#f3a470', solarRadius: 60,
            fogNear: 22, fogFar: 66
        },
        {
            name: 'Late Evening',
            // Night blue with enough lit windows and lamps to stay lively
            // without the whole scene glowing like a neon sign.
            skyTop: '#132035', skyMid: '#28374f', horizon: '#4a5568',
            fog: '#364355', background: '#223044',
            hemi: '#96a2b4', groundLight: '#222838', sunlight: '#a3b7dc',
            sunIntensity: 0.75, buildingTint: '#828b98', road: '#5f6874',
            curb: '#4a515d', sheen: '#75808f', windowGlow: 0.72,
            lampGlow: 0.85, stars: true, solarX: 0.82, solarY: 0.27,
            solarColor: '#d2dcf5', solarRadius: 32,
            fogNear: 30, fogFar: 92
        }
    ];

    const mat = (color, roughness = 0.7, metalness = 0) => new THREE.MeshStandardMaterial({
        color, roughness, metalness
    });

    function makeCanvasTexture(draw, width = 1024, height = 512) {
        const c = document.createElement('canvas');
        c.width = width;
        c.height = height;
        const g = c.getContext('2d');
        draw(g, width, height);
        const texture = new THREE.CanvasTexture(c);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
        return texture;
    }

    function glassTexture(theme = ROUND_THEMES[0]) {
        return makeCanvasTexture((g, w, h) => {
            const gradient = g.createLinearGradient(0, 0, w, h);
            gradient.addColorStop(0, '#172638');
            gradient.addColorStop(0.42, '#496171');
            gradient.addColorStop(1, '#172b3a');
            g.fillStyle = gradient;
            g.fillRect(0, 0, w, h);

            const cols = 24;
            const rows = 10;
            const cw = w / cols;
            const rh = h / rows;
            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    const seed = Math.abs(Math.sin((x + 1) * 17.13 + (y + 2) * 9.71));
                    const inset = 4;
                    const lit = seed > 0.69;
                    const warm = seed > 0.84;
                    g.fillStyle = warm
                        ? `rgba(255, 204, 145, ${0.27 + seed * 0.48})`
                        : lit
                            ? `rgba(174, 211, 235, ${0.2 + seed * 0.25})`
                            : `rgba(16, 30, 43, ${0.38 + seed * 0.22})`;
                    g.fillRect(x * cw + inset, y * rh + inset, cw - inset * 2, rh - inset * 2);
                    g.fillStyle = 'rgba(255,255,255,0.10)';
                    g.fillRect(x * cw + inset, y * rh + inset, 2, rh - inset * 2);
                }
            }

            // Heavy mullions and floor plates create a more convincing office facade.
            g.strokeStyle = 'rgba(8,18,29,0.82)';
            g.lineWidth = 8;
            for (let x = 0; x <= cols; x++) {
                g.beginPath(); g.moveTo(x * cw, 0); g.lineTo(x * cw, h); g.stroke();
            }
            for (let y = 0; y <= rows; y++) {
                g.beginPath(); g.moveTo(0, y * rh); g.lineTo(w, y * rh); g.stroke();
            }
            g.strokeStyle = 'rgba(230,239,246,0.18)';
            g.lineWidth = 2;
            for (let y = 1; y < rows; y += 2) {
                g.beginPath(); g.moveTo(0, y * rh); g.lineTo(w, y * rh); g.stroke();
            }
        });
    }

    function brandTexture(name) {
        const label = String(name).toLowerCase();
        return makeCanvasTexture((g, w, h) => {
            g.fillStyle = '#101923';
            g.fillRect(0, 0, w, h);
            g.fillStyle = 'rgba(255,255,255,0.07)';
            g.fillRect(0, h - 12, w, 12);
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.font = '800 156px Arial Black, Arial, sans-serif';

            if (label === 'google') {
                const letters = [
                    ['G', '#4285F4'], ['o', '#EA4335'], ['o', '#FBBC05'],
                    ['g', '#4285F4'], ['l', '#34A853'], ['e', '#EA4335']
                ];
                let total = 0;
                letters.forEach(([ch]) => total += g.measureText(ch).width);
                let x = (w - total) / 2;
                g.textAlign = 'left';
                for (const [ch, color] of letters) {
                    g.fillStyle = color;
                    g.fillText(ch, x, h * 0.5);
                    x += g.measureText(ch).width;
                }
            } else {
                const styles = {
                    amazon: '#f5f5f2', meta: '#62a9ff', nvidia: '#8bd34b',
                    openai: '#f3f5f7', netflix: '#e34b50', github: '#f0f0ed',
                    microsoft: '#f0f0ed'
                };
                const displayNames = {
                    amazon: 'amazon', meta: 'Meta', nvidia: 'NVIDIA',
                    openai: 'OpenAI', netflix: 'Netflix', microsoft: 'Microsoft'
                };
                g.fillStyle = styles[label] || '#f3f5f7';
                const display = displayNames[label] || name;
                g.fillText(display, w / 2, h * 0.47, w * 0.9);
                if (label === 'amazon') {
                    g.strokeStyle = '#f2a34a';
                    g.lineWidth = 11;
                    g.lineCap = 'round';
                    g.beginPath();
                    g.moveTo(w * 0.34, h * 0.73);
                    g.quadraticCurveTo(w * 0.53, h * 0.88, w * 0.7, h * 0.7);
                    g.stroke();
                    g.beginPath();
                    g.moveTo(w * 0.66, h * 0.68);
                    g.lineTo(w * 0.73, h * 0.68);
                    g.lineTo(w * 0.7, h * 0.78);
                    g.stroke();
                } else if (label === 'meta') {
                    g.strokeStyle = '#62a9ff';
                    g.lineWidth = 8;
                    g.beginPath();
                    g.ellipse(w * 0.23, h * 0.47, 22, 34, -0.25, 0, Math.PI * 2);
                    g.stroke();
                } else if (label === 'nvidia') {
                    g.fillStyle = '#8bd34b';
                    g.fillRect(w * 0.16, h * 0.34, 18, 72);
                }
            }
        }, 768, 256);
    }

    function skyTexture(theme) {
        return makeCanvasTexture((g, w, h) => {
            const grad = g.createLinearGradient(0, 0, 0, h);
            grad.addColorStop(0, theme.skyTop);
            grad.addColorStop(0.56, theme.skyMid);
            grad.addColorStop(1, theme.horizon);
            g.fillStyle = grad;
            g.fillRect(0, 0, w, h);

            const sx = w * (theme.solarX || 0.78);
            const sy = h * (theme.solarY || 0.42);
            const solarColor = theme.solarColor || '#fff0d8';
            const halo = g.createRadialGradient(sx, sy, 5, sx, sy, theme.stars ? 150 : 190);
            halo.addColorStop(0, theme.stars ? 'rgba(170,198,255,0.2)' : 'rgba(255,231,190,0.34)');
            halo.addColorStop(1, 'rgba(255,231,190,0)');
            g.fillStyle = halo;
            g.fillRect(0, 0, w, h);

            if (theme.stars) {
                for (let i = 0; i < 145; i++) {
                    const x = (Math.sin(i * 91.7) * 0.5 + 0.5) * w;
                    const y = (Math.sin(i * 37.1 + 2) * 0.5 + 0.5) * h * 0.72;
                    const r = i % 11 === 0 ? 2.1 : 0.9;
                    g.fillStyle = `rgba(235,241,255,${0.3 + (i % 5) * 0.1})`;
                    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
                }
                // A crescent moon, kept high enough to remain clear of the skyline.
                g.fillStyle = 'rgba(232,239,255,0.92)';
                g.beginPath(); g.arc(sx, sy, 27, 0, Math.PI * 2); g.fill();
                g.fillStyle = theme.skyTop;
                g.beginPath(); g.arc(sx + 11, sy - 8, 24, 0, Math.PI * 2); g.fill();
            } else {
                const radius = theme.solarRadius || (theme.name === 'Afternoon' ? 76 : 48);
                const sun = g.createRadialGradient(sx, sy, 2, sx, sy, radius * 2.8);
                sun.addColorStop(0, solarColor);
                sun.addColorStop(0.35, 'rgba(255,238,205,0.72)');
                sun.addColorStop(1, 'rgba(255,226,184,0)');
                g.fillStyle = sun;
                g.fillRect(sx - radius * 2.8, sy - radius * 2.8, radius * 5.6, radius * 5.6);
                g.beginPath();
                g.arc(sx, sy, radius * 0.40, 0, Math.PI * 2);
                g.fillStyle = solarColor;
                g.fill();
            }

            // Thin high cloud streaks keep the sky from looking like a flat gradient.
            if (!theme.stars) {
                for (let i = 0; i < 5; i++) {
                    const y = h * (0.18 + i * 0.075);
                    const x = w * (0.08 + (i % 2) * 0.36);
                    g.strokeStyle = `rgba(255,255,255,${theme.name === 'Afternoon' ? 0.12 : 0.09})`;
                    g.lineWidth = 9;
                    g.beginPath();
                    g.moveTo(x, y);
                    g.bezierCurveTo(x + 70, y - 13, x + 165, y + 9, x + 250, y - 2);
                    g.stroke();
                }
            }
        }, 1024, 512);
    }

    function concreteTexture() {
        return makeCanvasTexture((g, w, h) => {
            g.fillStyle = '#4a4e53';
            g.fillRect(0, 0, w, h);
            for (let i = 0; i < 5200; i++) {
                const x = Math.random() * w;
                const y = Math.random() * h;
                const a = Math.random() * 0.13;
                const size = Math.random() * 2.1 + 0.35;
                g.fillStyle = Math.random() > 0.52
                    ? `rgba(225,229,232,${a})`
                    : `rgba(8,13,18,${a + 0.025})`;
                g.fillRect(x, y, size, size * 0.7);
            }
            // Fine aggregate and a few faint repair seams, not a glossy mirror.
            g.strokeStyle = 'rgba(20,25,30,0.2)';
            g.lineWidth = 2;
            for (let y = 92; y < h; y += 150) {
                g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + 3); g.stroke();
            }
        }, 1024, 512);
    }

    function concreteFacadeTexture() {
        return makeCanvasTexture((g, w, h) => {
            const grad = g.createLinearGradient(0, 0, w, h);
            grad.addColorStop(0, '#aeb7bd');
            grad.addColorStop(0.5, '#858f98');
            grad.addColorStop(1, '#727f89');
            g.fillStyle = grad;
            g.fillRect(0, 0, w, h);

            const cols = 12, rows = 8;
            const cw = w / cols, rh = h / rows;
            for (let row = 0; row < rows; row++) {
                for (let col = 0; col < cols; col++) {
                    const seed = Math.abs(Math.sin((col + 3) * 14.7 + (row + 1) * 6.31));
                    const inset = 5;
                    g.fillStyle = seed > 0.73
                        ? 'rgba(255,213,163,0.62)'
                        : `rgba(21,39,54,${0.62 + seed * 0.2})`;
                    g.fillRect(col * cw + inset, row * rh + inset, cw - inset * 2, rh * 0.62);
                    g.fillStyle = 'rgba(228,235,239,0.72)';
                    g.fillRect(col * cw + inset, row * rh + rh * 0.68, cw - inset * 2, 3);
                }
            }
            g.strokeStyle = 'rgba(32,45,56,0.42)';
            g.lineWidth = 5;
            for (let col = 0; col <= cols; col++) {
                g.beginPath(); g.moveTo(col * cw, 0); g.lineTo(col * cw, h); g.stroke();
            }
            g.strokeStyle = 'rgba(242,245,246,0.2)';
            g.lineWidth = 3;
            for (let row = 0; row <= rows; row++) {
                g.beginPath(); g.moveTo(0, row * rh); g.lineTo(w, row * rh); g.stroke();
            }
        }, 1024, 512);
    }

    function labelTexture(label, bg = '#142b3b', fg = '#fff4d7') {
        return makeCanvasTexture((g, w, h) => {
            const text = String(label || 'RESUME').trim().toUpperCase();
            const gradient = g.createLinearGradient(0, 0, 0, h);
            gradient.addColorStop(0, bg);
            gradient.addColorStop(1, '#101d2a');
            g.fillStyle = gradient;
            g.fillRect(0, 0, w, h);

            // Bright double keyline separates the label from the obstacle surface.
            g.strokeStyle = '#f4c96c';
            g.lineWidth = 20;
            g.strokeRect(12, 12, w - 24, h - 24);
            g.strokeStyle = 'rgba(255,255,255,0.46)';
            g.lineWidth = 5;
            g.strokeRect(34, 34, w - 68, h - 68);

            // Wrap long obstacle phrases instead of shrinking them into tiny text.
            const words = text.split(/\s+/).filter(Boolean);
            let fontSize = 270;
            let lines = [text];
            g.font = `900 ${fontSize}px Arial Black, Arial, sans-serif`;
            const maxTextWidth = w - 130;
            if (g.measureText(text).width > maxTextWidth) {
                lines = [];
                let current = '';
                for (const word of words) {
                    const candidate = current ? `${current} ${word}` : word;
                    if (current && g.measureText(candidate).width > maxTextWidth) {
                        lines.push(current);
                        current = word;
                    } else {
                        current = candidate;
                    }
                }
                if (current) lines.push(current);
                if (lines.length > 3) lines = [lines[0], lines[1], lines.slice(2).join(' ')];
                fontSize = lines.length === 2 ? 190 : 158;
            }

            g.font = `900 ${fontSize}px Arial Black, Arial, sans-serif`;
            while (lines.some(line => g.measureText(line).width > maxTextWidth) && fontSize > 112) {
                fontSize -= 8;
                g.font = `900 ${fontSize}px Arial Black, Arial, sans-serif`;
            }

            const lineHeight = fontSize * 0.98;
            const totalHeight = lineHeight * lines.length;
            const firstY = h * 0.51 - totalHeight / 2 + lineHeight / 2;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.lineJoin = 'round';
            g.shadowColor = 'rgba(0,0,0,0.85)';
            g.shadowBlur = 12;
            g.shadowOffsetY = 6;
            lines.forEach((line, index) => {
                const y = firstY + index * lineHeight;
                g.lineWidth = Math.max(12, fontSize * 0.075);
                g.strokeStyle = 'rgba(0,0,0,0.88)';
                g.strokeText(line, w / 2, y, maxTextWidth);
                g.fillStyle = fg;
                g.fillText(line, w / 2, y, maxTextWidth);
            });
            g.shadowBlur = 0;
            g.shadowOffsetY = 0;

            // Small bright marker makes each label read as a deliberate game prop.
            g.fillStyle = '#f4c96c';
            g.fillRect(w * 0.08, h - 54, w * 0.84, 9);
        }, 1024, 512);
    }

    function doorPanelTexture(label, final = false) {
        return makeCanvasTexture((g, w, h) => {
            const gradient = g.createLinearGradient(0, 0, w, h);
            gradient.addColorStop(0, final ? '#65502f' : '#385b70');
            gradient.addColorStop(0.48, final ? '#263f50' : '#244356');
            gradient.addColorStop(1, '#142a3b');
            g.fillStyle = gradient;
            g.fillRect(0, 0, w, h);

            // Subtle glass reflections keep it reading as a door, not a floating banner.
            const reflection = g.createLinearGradient(0, 0, w * 0.35, 0);
            reflection.addColorStop(0, 'rgba(255,255,255,0.17)');
            reflection.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = reflection;
            g.fillRect(0, 0, w * 0.35, h);

            g.strokeStyle = final ? 'rgba(255,219,153,0.92)' : 'rgba(223,241,249,0.88)';
            g.lineWidth = 12;
            g.strokeRect(15, 15, w - 30, h - 30);
            g.strokeStyle = 'rgba(255,255,255,0.16)';
            g.lineWidth = 3;
            g.strokeRect(32, 32, w - 64, h - 64);

            const text = String(label || 'OFFER').toUpperCase();
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            let fontSize = text.length > 9 ? 78 : text.length > 6 ? 92 : 112;
            g.font = `900 ${fontSize}px Arial, sans-serif`;
            while (g.measureText(text).width > w - 86 && fontSize > 46) {
                fontSize -= 4;
                g.font = `900 ${fontSize}px Arial, sans-serif`;
            }
            g.fillStyle = 'rgba(0,0,0,0.32)';
            g.fillText(text, w / 2 + 3, h * 0.51 + 5);
            g.fillStyle = final ? '#ffe4a8' : '#f4f7f7';
            g.fillText(text, w / 2, h * 0.51);

            g.fillStyle = final ? 'rgba(255,224,164,0.9)' : 'rgba(221,239,247,0.78)';
            g.fillRect(w * 0.28, h * 0.67, w * 0.44, 5);
            g.font = '700 26px Arial, sans-serif';
            g.fillStyle = 'rgba(244,248,250,0.82)';
            g.fillText(final ? 'YOU MADE IT' : 'INTERVIEW STAGE', w / 2, h * 0.73);
        }, 512, 900);
    }

    function mesh(geometry, material, parent, position) {
        const object = new THREE.Mesh(geometry, material);
        if (position) object.position.set(position.x || 0, position.y || 0, position.z || 0);
        object.castShadow = true;
        object.receiveShadow = true;
        parent.add(object);
        return object;
    }

    function addBox(parent, width, height, depth, material, x, y, z) {
        return mesh(new THREE.BoxGeometry(width, height, depth), material, parent, { x, y, z });
    }

    function disposeTree(object) {
        object.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach(material => {
                    for (const value of Object.values(material)) {
                        if (value && value.isTexture) value.dispose();
                    }
                    material.dispose();
                });
            }
        });
    }

    function clearGroup(group) {
        while (group.children.length) {
            const child = group.children[group.children.length - 1];
            group.remove(child);
            disposeTree(child);
        }
    }

    function addTree(parent, x, baseY, z, s = 1) {
        const trunk = mat('#554339', 0.94);
        const leaves = [mat('#263e35', 0.92), mat('#365244', 0.9), mat('#536b50', 0.92)];
        const group = new THREE.Group();
        group.position.set(x, baseY, z);
        parent.add(group);
        mesh(new THREE.CylinderGeometry(0.11 * s, 0.18 * s, 2.1 * s, 7), trunk, group, { x: 0, y: 1.05 * s, z: 0 });
        const clusters = [
            [-0.45, 2.55, 0.0, 0.92], [0.38, 2.7, 0.08, 1.05],
            [0, 3.35, -0.08, 1.1], [-0.12, 2.2, 0.18, 0.8]
        ];
        clusters.forEach((p, i) => {
            const foliage = mesh(new THREE.IcosahedronGeometry(p[3] * s, 2), leaves[i % leaves.length], group,
                { x: p[0] * s, y: p[1] * s, z: p[2] });
            foliage.scale.set(1.05, 0.9, 0.82);
            foliage.castShadow = false;
        });
        return group;
    }

    function addBrandSign(parent, name, x, y, z, width = 2.25) {
        const sign = new THREE.Group();
        sign.position.set(x, y, z);
        parent.add(sign);
        const panel = mat('#111b26', 0.38, 0.2);
        addBox(sign, width + 0.18, 0.78, 0.14, panel, 0, 0, 0);
        const texture = brandTexture(name);
        const face = mesh(new THREE.PlaneGeometry(width, 0.62),
            new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
            sign, { x: 0, y: 0, z: 0.079 });
        face.renderOrder = 3;
        return sign;
    }

    function addOfficeBuilding(parent, x, baseY, width, height, z, options = {}) {
        const group = new THREE.Group();
        group.position.set(x, baseY, z);
        parent.add(group);

        const style = options.style || 'glass';
        const depth = options.depth || 1.35;
        const baseColor = options.tint || '#aab4bd';
        const facadeTexture = style === 'concrete' ? concreteFacadeTexture() : glassTexture();
        const bodyMat = new THREE.MeshStandardMaterial({
            map: facadeTexture,
            color: baseColor,
            roughness: style === 'glass' ? 0.34 : 0.9,
            metalness: style === 'glass' ? 0.3 : 0.04
        });
        buildingMaterials.push(bodyMat);
        addBox(group, width, height, depth, bodyMat, 0, height / 2, 0);

        const frontZ = depth / 2 + 0.035;
        const frameMat = mat(style === 'concrete' ? '#9ca5aa' : '#263541', 0.52, 0.34);
        const edgeMat = mat(style === 'concrete' ? '#737f87' : '#1c2a35', 0.5, 0.22);
        addBox(group, 0.12, height + 0.12, depth + 0.1, edgeMat, -width / 2, height / 2, 0.02);
        addBox(group, 0.12, height + 0.12, depth + 0.1, edgeMat, width / 2, height / 2, 0.02);
        addBox(group, width + 0.14, 0.12, depth + 0.12, frameMat, 0, height, 0.03);

        // Thin floor bands and mullions give the facade a believable scale.
        const floors = Math.max(4, Math.floor(height / 0.78));
        for (let i = 1; i < floors; i++) {
            const y = (height / floors) * i;
            addBox(group, width + 0.04, 0.035, depth + 0.08,
                frameMat, 0, y, 0.045);
        }
        const columns = Math.max(3, Math.floor(width / 0.82));
        for (let i = 1; i < columns; i++) {
            const cx = -width / 2 + (width / columns) * i;
            addBox(group, 0.035, height - 0.14, 0.055,
                edgeMat, cx, height / 2, frontZ);
        }

        // A darker, recessed ground-floor lobby separates the facade from the street.
        const lobbyMat = new THREE.MeshStandardMaterial({
            color: '#344957', roughness: 0.28, metalness: 0.25,
            emissive: '#1a2c38', emissiveIntensity: 0.12
        });
        windowMaterials.push(lobbyMat);
        addBox(group, width * 0.56, Math.min(0.92, height * 0.23), 0.07,
            lobbyMat, 0, 0.49, frontZ + 0.06);

        // Narrow vertical fins catch the sunlight without turning each building into a wall.
        if (style === 'glass') {
            for (let i = 0; i < 3; i++) {
                const fx = -width * 0.34 + i * width * 0.34;
                addBox(group, 0.045, height - 0.2, 0.09,
                    frameMat, fx, height / 2, frontZ + 0.055);
            }
        }

        if (options.brand) {
            const signWidth = Math.min(width * 0.76, options.brand.length > 6 ? 2.55 : 2.25);
            addBrandSign(group, options.brand,
                -width * 0.08,
                Math.min(height - 0.78, height * 0.58),
                frontZ + 0.11,
                signWidth);
        }

        // Small rooftop parapet and mechanical housings add a recognisable skyline edge.
        addBox(group, width + 0.2, 0.11, depth + 0.16,
            frameMat, 0, height + 0.055, 0.02);
        for (let i = 0; i < 2; i++) {
            addBox(group, 0.42, 0.22, 0.44, mat('#68747d', 0.82, 0.06),
                -width * 0.23 + i * width * 0.46, height + 0.21, -0.05);
        }

        // Distant architecture should shape the skyline, not cast hard shadows over gameplay.
        group.traverse(child => {
            if (child.isMesh) {
                child.castShadow = false;
                child.receiveShadow = false;
            }
        });
        return group;
    }

    function addSceneryTrack(object, baseX, span, speed) {
        sceneryTracks.push({ object, baseX, span, speed });
    }

    function buildEnvironment(s) {
        clearGroup(environment);
        clearGroup(worldItems);
        obstacleMeshes.clear();
        coinMeshes.clear();
        powerMeshes.clear();
        doorMeshes.clear();
        groundMarkers = [];
        sceneryTracks = [];
        buildingMaterials = [];
        windowMaterials = [];
        lampMaterials = [];
        activeThemeIndex = -1;
        skyMesh = null;
        skyMaterial = null;
        roadMaterial = null;
        curbMaterial = null;
        roadSheenMaterial = null;

        const scale = 10 / s.LH;
        const worldWidth = s.LW * scale;
        const groundY = (s.LH / 2 - s.GY) * scale;
        layout = { scale, worldWidth, groundY, LW: s.LW, LH: s.LH, GY: s.GY };

        camera.left = -worldWidth / 2;
        camera.right = worldWidth / 2;
        camera.top = 5;
        camera.bottom = -5;
        camera.updateProjectionMatrix();

        // Dimmer, less saturated ambient than before — a bright hemisphere
        // light was flattening the whole scene and burying the runner.
        ambientLight = new THREE.HemisphereLight(0xdbe3e9, 0x44434a, 1.3);
        environment.add(ambientLight);
        keyLight = new THREE.DirectionalLight(0xffeedb, 1.75);
        keyLight.position.set(-9, 12, 13);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.set(1024, 1024);
        keyLight.shadow.camera.left = -22;
        keyLight.shadow.camera.right = 22;
        keyLight.shadow.camera.top = 14;
        keyLight.shadow.camera.bottom = -14;
        keyLight.shadow.bias = -0.00025;
        environment.add(keyLight);

        // Low cool fill from the camera side only — keeps the runner's
        // shadow side from disappearing into dark backgrounds at night
        // without brightening the scene itself.
        fillLight = new THREE.DirectionalLight(0xaecbe8, 0.45);
        fillLight.position.set(6, 5, 20);
        environment.add(fillLight);

        // The sky remains open above a low, broken skyline.
        skyMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', depthWrite: false, fog: false });
        skyMesh = mesh(new THREE.PlaneGeometry(worldWidth * 5, 25), skyMaterial,
            environment, { x: 0, y: 1.25, z: -30 });
        skyMesh.renderOrder = -5;
        skyMesh.castShadow = false;
        skyMesh.receiveShadow = false;

        const span = worldWidth * 2.9;

        // Distant, shorter towers. They are widely spaced so the sky stays visible.
        const farTints = ['#8997a1', '#a0a5aa', '#8997a8', '#9b9da4', '#7e909d'];
        const farCount = 17;
        for (let i = 0; i < farCount; i++) {
            const x = -span / 2 + (i + 0.5) * span / farCount;
            const width = 2.05 + ((i * 7) % 4) * 0.34;
            const height = 2.35 + ((i * 5 + 2) % 5) * 0.31;
            const tower = addOfficeBuilding(
                environment, x, groundY + 0.04, width, height,
                -25.5 - (i % 3) * 1.25,
                { style: i % 4 === 0 ? 'concrete' : 'glass', tint: farTints[i % farTints.length], depth: 0.85 }
            );
            addSceneryTrack(tower, x, span, 0.07);
        }

        // Mid-distance offices carry the company signs, spaced across the level.
        // Every round scrolls through this same campus rather than a static wallpaper.
        const companies = [
            { brand: 'google', w: 3.7, h: 4.6, style: 'glass', tint: '#9eacb7' },
            { brand: 'amazon', w: 4.0, h: 4.0, style: 'concrete', tint: '#b6b1a8' },
            { brand: 'meta', w: 3.6, h: 4.8, style: 'glass', tint: '#9caeb8' },
            { brand: 'nvidia', w: 3.85, h: 4.25, style: 'glass', tint: '#9ba9b0' },
            { brand: 'openai', w: 4.0, h: 4.65, style: 'concrete', tint: '#b4b7b5' },
            { brand: 'netflix', w: 3.6, h: 3.9, style: 'glass', tint: '#a2a8b2' },
            { brand: 'microsoft', w: 4.1, h: 4.5, style: 'glass', tint: '#9daab5' }
        ];
        companies.forEach((building, i) => {
            const x = -span / 2 + (i + 0.5) * span / companies.length;
            const office = addOfficeBuilding(
                environment, x, groundY + 0.02,
                building.w, building.h,
                -16.5 - (i % 3) * 1.05,
                { ...building, depth: 1.25 }
            );
            addSceneryTrack(office, x, span, 0.16);
        });

        // A handful of trees and planters provide scale, without turning the scene into a park.
        const treePositions = [-span * 0.42, -span * 0.08, span * 0.27, span * 0.47];
        treePositions.forEach((x, i) => {
            const treeGroup = addTree(environment, x, groundY + 0.28, -7.1, i % 2 ? 0.68 : 0.8);
            addSceneryTrack(treeGroup, x, span, 0.30);
        });

        const planterMat = mat('#737b78', 0.86, 0.04);
        const shrubMat = mat('#43584c', 0.96);
        for (const x of [-span * 0.31, -span * 0.04, span * 0.23, span * 0.46]) {
            const planter = new THREE.Group();
            planter.position.set(x, groundY, -4.2);
            environment.add(planter);
            addBox(planter, 1.35, 0.38, 0.72, planterMat, 0, 0.19, 0);
            for (let k = 0; k < 3; k++) {
                const shrub = mesh(new THREE.IcosahedronGeometry(0.28, 1), shrubMat,
                    planter, { x: -0.36 + k * 0.36, y: 0.58, z: 0.03 });
                shrub.scale.set(1.1, 0.72, 0.82);
            }
            addSceneryTrack(planter, x, span, 0.42);
        }

        // Street lamps are landmarks in the foreground, with restrained glow.
        for (const x of [-span * 0.43, -span * 0.16, span * 0.12, span * 0.39]) {
            const lampGroup = new THREE.Group();
            lampGroup.position.set(x, groundY, -2.1);
            environment.add(lampGroup);
            const poleMat = mat('#35414a', 0.38, 0.58);
            addBox(lampGroup, 0.065, 3.15, 0.075, poleMat, 0, 1.575, 0);
            addBox(lampGroup, 0.48, 0.065, 0.1, poleMat, 0.2, 3.12, 0);
            const lampMat = new THREE.MeshStandardMaterial({
                color: '#fff0cf', emissive: '#ffd28d', emissiveIntensity: 0.12,
                roughness: 0.34
            });
            lampMaterials.push(lampMat);
            const lamp = mesh(new THREE.BoxGeometry(0.25, 0.1, 0.18), lampMat,
                lampGroup, { x: 0.4, y: 3.06, z: 0.03 });
            lamp.castShadow = false;
            addSceneryTrack(lampGroup, x, span, 0.42);
        }

        // Asphalt and curb. The road remains uncluttered around the runner and obstacles.
        const bottomY = -5.4;
        const roadHeight = Math.max(0.4, groundY - bottomY);
        const asphalt = concreteTexture();
        asphalt.wrapS = THREE.RepeatWrapping;
        asphalt.wrapT = THREE.RepeatWrapping;
        asphalt.repeat.set(20, 2);
        roadMaterial = new THREE.MeshStandardMaterial({
            map: asphalt, color: '#aeb8c1', roughness: 0.84, metalness: 0.02
        });
        addBox(environment, worldWidth * 3.4, roadHeight, 2.15,
            roadMaterial, 0, (groundY + bottomY) / 2, 1.7);

        curbMaterial = mat('#a9adb0', 0.78, 0.02);
        addBox(environment, worldWidth * 3.4, 0.25, 2.35,
            curbMaterial, 0, groundY - 0.14, 1.05);
        addBox(environment, worldWidth * 3.4, 0.035, 2.4,
            mat('#d8d8d4', 0.62), 0, groundY - 0.012, 0.98);

        roadSheenMaterial = new THREE.MeshBasicMaterial({
            color: '#d6d3cf', transparent: true, opacity: 0.045
        });
        for (let i = 0; i < 18; i++) {
            const x = -worldWidth * 1.45 + i * worldWidth * 0.17;
            const y = bottomY + 0.22 + (i % 5) * 0.13;
            const streak = addBox(environment, 0.35 + (i % 4) * 0.2, 0.016, 0.012,
                roadSheenMaterial, x, y, 2.82);
            streak.rotation.z = i % 2 ? 0.012 : -0.01;
        }

        // Sidewalk joints and lane dashes are the strongest motion cues in the foreground.
        const tileLineMat = new THREE.MeshBasicMaterial({
            color: '#e0e1df', transparent: true, opacity: 0.24
        });
        for (let i = 0; i < 19; i++) {
            const line = addBox(environment, 0.018, 0.34, 0.015, tileLineMat,
                -worldWidth * 1.35 + i * worldWidth * 0.15, groundY - 0.39, 2.87);
            groundMarkers.push(line);
        }
        const dashMat = new THREE.MeshBasicMaterial({
            color: '#e3dfd7', transparent: true, opacity: 0.48
        });
        for (let i = 0; i < 12; i++) {
            const dash = addBox(environment, 0.92, 0.026, 0.02, dashMat,
                -worldWidth * 1.4 + i * worldWidth * 0.25, bottomY + 1.1, 2.9);
            groundMarkers.push(dash);
        }

        createPlayer();
        applyRoundTheme(Number.isFinite(s.roundIndex) ? s.roundIndex : 0, true);
    }

    function applyRoundTheme(roundIndex, force = false) {
        const index = Math.max(0, Math.min(ROUND_THEMES.length - 1, roundIndex | 0));
        if (!force && index === activeThemeIndex) return;
        activeThemeIndex = index;
        const theme = ROUND_THEMES[index];

        scene.background = new THREE.Color(theme.background);
        if (!scene.fog) scene.fog = new THREE.Fog(theme.fog, theme.fogNear || 20, theme.fogFar || 60);
        scene.fog.color.set(theme.fog);
        // Fog starts closer than before so distant buildings soften into the
        // haze instead of competing with the runner for contrast.
        scene.fog.near = theme.fogNear || 20;
        scene.fog.far = theme.fogFar || 60;

        if (ambientLight) {
            ambientLight.color.set(theme.hemi);
            ambientLight.groundColor.set(theme.groundLight);
            ambientLight.intensity = index === 3 ? 1.1 : (index === 2 ? 1.15 : 1.3);
        }
        if (keyLight) {
            keyLight.color.set(theme.sunlight);
            keyLight.intensity = theme.sunIntensity;
            keyLight.position.set(index === 2 ? -8 : -9, index === 1 ? 15 : 12, 13);
        }
        if (fillLight) {
            // Fill stays low and roughly constant — it's there to keep the
            // runner's far side readable, not to light the scene.
            fillLight.intensity = index === 3 ? 0.38 : 0.45;
        }
        if (skyMaterial) {
            const previous = skyMaterial.map;
            skyMaterial.map = skyTexture(theme);
            skyMaterial.needsUpdate = true;
            if (previous) previous.dispose();
        }
        buildingMaterials.forEach(material => material.color.set(theme.buildingTint));
        windowMaterials.forEach(material => {
            if (material.emissiveIntensity !== undefined) {
                material.emissiveIntensity = theme.windowGlow;
            }
        });
        lampMaterials.forEach(material => {
            material.emissiveIntensity = theme.lampGlow;
        });
        if (roadMaterial) roadMaterial.color.set(theme.road);
        if (curbMaterial) curbMaterial.color.set(theme.curb);
        if (roadSheenMaterial) roadSheenMaterial.color.set(theme.sheen);
    }

    function createJointedLimb(parent, x, y, z, upperLength, lowerLength, radius, material, shoeMaterial = null, isLeg = false) {
        const upper = new THREE.Group();
        upper.position.set(x, y, z);
        parent.add(upper);
        mesh(new THREE.CapsuleGeometry(radius, upperLength, 5, 12), material,
            upper, { x: 0, y: -upperLength * 0.5, z: 0 });

        const lower = new THREE.Group();
        lower.position.y = -upperLength;
        upper.add(lower);
        mesh(new THREE.CapsuleGeometry(radius * 0.84, lowerLength, 5, 12), material,
            lower, { x: 0, y: -lowerLength * 0.5, z: 0 });

        if (isLeg && shoeMaterial) {
            addBox(lower, 0.38, 0.15, 0.23, shoeMaterial, 0.12, -lowerLength - 0.01, 0.015);
            addBox(lower, 0.39, 0.045, 0.235, mat('#d0ccc4', 0.78), 0.13, -lowerLength - 0.085, 0.018);
            addBox(lower, 0.18, 0.035, 0.24, mat('#8b8b87', 0.75), 0.02, -lowerLength - 0.09, 0.02);
        } else {
            mesh(new THREE.SphereGeometry(radius * 0.82, 12, 10), mat('#b77c5b', 0.82),
                lower, { x: 0.01, y: -lowerLength - 0.04, z: 0.015 });
        }

        return { upper, lower };
    }

    function createPlayer() {
        if (player) {
            characterLayer.remove(player);
            disposeTree(player);
        }
        if (playerShadow) {
            characterLayer.remove(playerShadow);
            disposeTree(playerShadow);
        }

        const group = new THREE.Group();
        characterLayer.add(group);
        player = group;

        const skin = mat('#b77b5e', 0.86);
        const skinShade = mat('#8d5844', 0.9);
        // A warm stone shirt instead of near-white — the old tone washed
        // out against pale skies. This keeps enough value contrast to read
        // against every round's background, bright or dark, without going flat.
        const shirt = mat('#d8cfb9', 0.88);
        const shirtShadow = mat('#aea386', 0.86);
        const shirtSeam = mat('#948a71', 0.9);
        const pants = mat('#202832', 0.92);
        const pantsHighlight = mat('#39424b', 0.88);
        const shoes = mat('#1b2026', 0.72, 0.08);
        const hair = mat('#171719', 0.98);
        const hairHighlight = mat('#29282a', 0.94);
        const backpack = mat('#20272e', 0.91);
        const backpackTrim = mat('#59616a', 0.82, 0.1);

        // Backpack with padded body, outer pocket, seams and shoulder straps.
        const bag = new THREE.Group();
        bag.position.set(-0.39, 1.34, -0.20);
        group.add(bag);
        const bagBody = mesh(new THREE.BoxGeometry(0.49, 0.77, 0.34), backpack, bag,
            { x: 0, y: 0, z: 0 });
        bagBody.rotation.z = -0.06;
        addBox(bag, 0.39, 0.24, 0.055, backpackTrim, 0.015, -0.20, 0.19);
        addBox(bag, 0.12, 0.045, 0.065, mat('#b8a46e', 0.65, 0.25), 0.02, -0.20, 0.225);
        addBox(bag, 0.035, 0.64, 0.055, backpackTrim, 0.22, 0.03, 0.14);
        addBox(bag, 0.035, 0.64, 0.055, backpackTrim, -0.20, 0.03, 0.14);
        const strapBack = mat('#151b21', 0.9);
        addBox(group, 0.11, 0.78, 0.07, strapBack, -0.20, 1.42, 0.22);

        // Shirt body, leaning into the run.
        const torso = new THREE.Group();
        torso.position.set(0, 1.44, 0);
        torso.rotation.z = -0.10;
        group.add(torso);
        mesh(new THREE.CapsuleGeometry(0.285, 0.59, 7, 16), shirt, torso,
            { x: 0.015, y: 0, z: 0 });
        mesh(new THREE.CapsuleGeometry(0.245, 0.2, 5, 12), pants, group,
            { x: -0.005, y: 0.91, z: -0.01 });

        // Shirt placket, buttons, chest pocket, hem and collar.
        addBox(torso, 0.035, 0.60, 0.025, shirtShadow, 0.12, -0.015, 0.277);
        for (let i = 0; i < 4; i++) {
            mesh(new THREE.SphereGeometry(0.018, 8, 6), mat('#8b8e8c', 0.5, 0.08), torso,
                { x: 0.13, y: 0.19 - i * 0.13, z: 0.298 });
        }
        addBox(torso, 0.19, 0.17, 0.025, shirtShadow, 0.205, -0.05, 0.23);
        addBox(torso, 0.205, 0.025, 0.028, shirtSeam, 0.205, 0.04, 0.245);
        addBox(torso, 0.32, 0.07, 0.03, shirtShadow, 0, -0.47, 0.21);
        const collarLeft = mesh(new THREE.ConeGeometry(0.12, 0.25, 4), shirt, torso,
            { x: 0.14, y: 0.40, z: 0.12 });
        collarLeft.rotation.z = Math.PI * 0.50;
        const collarRight = mesh(new THREE.ConeGeometry(0.12, 0.25, 4), shirt, torso,
            { x: -0.10, y: 0.40, z: 0.12 });
        collarRight.rotation.z = -Math.PI * 0.50;

        // Neck and sculpted head profile.
        mesh(new THREE.CylinderGeometry(0.095, 0.11, 0.22, 16), skin, group,
            { x: 0.055, y: 1.94, z: 0.015 });
        const headGroup = new THREE.Group();
        headGroup.position.set(0.075, 2.18, 0.015);
        group.add(headGroup);
        const head = mesh(new THREE.SphereGeometry(0.255, 28, 22), skin, headGroup,
            { x: 0, y: 0, z: 0 });
        head.scale.set(0.88, 1.06, 0.88);
        mesh(new THREE.SphereGeometry(0.075, 16, 12), skin, headGroup,
            { x: -0.205, y: -0.02, z: 0.155 });
        mesh(new THREE.SphereGeometry(0.03, 10, 8), skinShade, headGroup,
            { x: -0.225, y: -0.02, z: 0.216 });
        // Nose, brow, eye and mouth are placed on the visible side profile.
        mesh(new THREE.SphereGeometry(0.052, 14, 10), skin, headGroup,
            { x: 0.21, y: -0.05, z: 0.045 });
        mesh(new THREE.SphereGeometry(0.026, 10, 8), mat('#17191d', 0.6), headGroup,
            { x: 0.105, y: 0.04, z: 0.211 });
        mesh(new THREE.SphereGeometry(0.03, 10, 8), hair, headGroup,
            { x: 0.105, y: 0.075, z: 0.212 });
        addBox(headGroup, 0.10, 0.018, 0.025, hair, 0.095, 0.095, 0.205);
        addBox(headGroup, 0.085, 0.014, 0.015, skinShade, 0.175, -0.14, 0.175);

        // Wavy dark hair, with separate curls to avoid a plastic helmet silhouette.
        const cap = mesh(new THREE.SphereGeometry(0.27, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.58),
            hair, headGroup, { x: -0.035, y: 0.11, z: -0.02 });
        cap.scale.set(1.04, 0.86, 0.96);
        const curls = [
            [-0.17, 0.17, 0.085, 0.105], [-0.06, 0.30, 0.055, 0.11],
            [0.08, 0.29, 0.065, 0.10], [0.20, 0.22, 0.025, 0.085],
            [-0.23, 0.07, 0.115, 0.09], [-0.21, -0.04, 0.065, 0.075]
        ];
        curls.forEach((c, i) => {
            const curl = mesh(new THREE.SphereGeometry(c[3], 12, 10),
                i % 2 ? hairHighlight : hair, headGroup,
                { x: c[0], y: c[1], z: c[2] });
            curl.scale.set(1.25, 0.82, 1);
        });

        // Articulated legs and arms. Upper/lower segments animate independently.
        const leftLeg = createJointedLimb(group, -0.13, 0.88, 0.12,
            0.39, 0.43, 0.115, pants, shoes, true);
        const rightLeg = createJointedLimb(group, 0.13, 0.88, -0.10,
            0.39, 0.43, 0.115, pants, shoes, true);
        const leftArm = createJointedLimb(group, -0.25, 1.72, 0.15,
            0.39, 0.39, 0.082, shirt, null, false);
        const rightArm = createJointedLimb(group, 0.23, 1.72, -0.12,
            0.39, 0.39, 0.082, shirt, null, false);

        // Shirt cuffs and pant seam details visible from the side.
        addBox(leftArm.upper, 0.17, 0.07, 0.18, shirtShadow, 0, -0.36, 0.01);
        addBox(rightArm.upper, 0.17, 0.07, 0.18, shirtShadow, 0, -0.36, 0.01);
        addBox(leftLeg.upper, 0.035, 0.58, 0.02, pantsHighlight, 0.08, -0.17, 0.104);
        addBox(rightLeg.upper, 0.035, 0.58, 0.02, pantsHighlight, 0.08, -0.17, -0.09);

        // Small tailoring details help the character read as a person, not a mannequin.
        const belt = mat('#242a30', 0.64, 0.12);
        const buckle = mat('#b5b9b8', 0.28, 0.72);
        addBox(group, 0.49, 0.075, 0.29, belt, 0, 0.985, 0.045);
        addBox(group, 0.105, 0.10, 0.035, buckle, 0.02, 0.985, 0.205);
        addBox(group, 0.22, 0.018, 0.022, pantsHighlight, -0.15, 0.79, 0.12);
        addBox(group, 0.22, 0.018, 0.022, pantsHighlight, 0.16, 0.79, 0.12);

        // Pocket stitching and subtle sleeve folds.
        addBox(torso, 0.012, 0.15, 0.018, shirtSeam, 0.29, -0.08, 0.13);
        addBox(torso, 0.19, 0.012, 0.02, shirtSeam, 0.205, -0.13, 0.235);
        for (const arm of [leftArm, rightArm]) {
            addBox(arm.upper, 0.16, 0.018, 0.19, shirtSeam, 0, -0.22, 0.055);
            addBox(arm.upper, 0.14, 0.018, 0.19, shirtShadow, 0, -0.29, 0.055);
        }

        // Watch on the nearer wrist and visible laces on both shoes.
        const watchCase = mat('#303b45', 0.28, 0.74);
        const watchFace = new THREE.MeshBasicMaterial({ color: '#9ed3dc' });
        addBox(leftArm.lower, 0.15, 0.085, 0.19, watchCase, 0.015, -0.70, 0.07);
        addBox(leftArm.lower, 0.095, 0.055, 0.012, watchFace, 0.015, -0.70, 0.172);
        for (const leg of [leftLeg, rightLeg]) {
            for (let i = 0; i < 3; i++) {
                const lace = addBox(leg.lower, 0.13, 0.018, 0.018, mat('#d3d4d1', 0.8),
                    0.13, -0.48 - i * 0.045, 0.142);
                lace.rotation.z = -0.16;
            }
        }

        group.userData.rig = { leftLeg, rightLeg, leftArm, rightArm, torso, head, headGroup, bag };

        // Match the original robot shield: a simple pale-blue filled circle
        // with one dashed outline. It stays upright even during a dive.
        if (shieldVisual) {
            characterLayer.remove(shieldVisual);
            disposeTree(shieldVisual);
        }
        shieldVisual = new THREE.Group();
        const shieldRadius = 40 * layout.scale;
        const shieldFill = mesh(
            new THREE.CircleGeometry(shieldRadius, 64),
            new THREE.MeshBasicMaterial({
                color: '#bfe3ff',
                transparent: true,
                opacity: 0.28,
                depthWrite: false,
                depthTest: false
            }),
            shieldVisual
        );
        shieldFill.renderOrder = 10;

        // The original 2D shield uses a 7px dash followed by a 6px gap.
        const dashPositions = [];
        const dashCount = 19;
        const cycle = (Math.PI * 2) / dashCount;
        const dashArc = cycle * (7 / 13);
        for (let dash = 0; dash < dashCount; dash++) {
            const startAngle = dash * cycle;
            const segments = 5;
            for (let segment = 0; segment < segments; segment++) {
                const a0 = startAngle + dashArc * segment / segments;
                const a1 = startAngle + dashArc * (segment + 1) / segments;
                dashPositions.push(
                    Math.cos(a0) * shieldRadius, Math.sin(a0) * shieldRadius, 0.012,
                    Math.cos(a1) * shieldRadius, Math.sin(a1) * shieldRadius, 0.012
                );
            }
        }
        const dashGeometry = new THREE.BufferGeometry();
        dashGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dashPositions, 3));
        const dashOutline = new THREE.LineSegments(
            dashGeometry,
            new THREE.LineBasicMaterial({
                color: '#6fb2f0',
                transparent: true,
                opacity: 1,
                depthTest: false
            })
        );
        dashOutline.renderOrder = 11;
        shieldVisual.add(dashOutline);
        shieldVisual.visible = false;
        characterLayer.add(shieldVisual);

        playerShadow = mesh(new THREE.CircleGeometry(0.62, 32),
            new THREE.MeshBasicMaterial({ color: '#15191e', transparent: true, opacity: 0.23, depthWrite: false }),
            characterLayer, { x: 0, y: layout.groundY + 0.015, z: 2.75 });
        playerShadow.scale.set(1, 0.2, 1);
    }

    function createObstacle(o) {
        const group = new THREE.Group();
        const scale = layout.scale;
        const cardboard = mat('#bd9569', 0.92);
        const cardboardSide = mat('#76543a', 0.94);
        const tape = mat('#d9bd85', 0.78);
        const darkMetal = mat('#354654', 0.34, 0.52);
        const hazardRed = mat('#a84343', 0.56, 0.18);

        if (o.type === 'crate') {
            // A corrugated parcel with taped seams, reinforced corners and a shipping label.
            const w = Math.max(0.95, o.w * scale);
            const h = Math.max(0.78, o.h * scale);
            addBox(group, w, h, 0.92, cardboard, 0, h / 2, 0);
            addBox(group, w * 0.98, 0.07, 0.94, cardboardSide, 0, h * 0.5, 0.02);
            addBox(group, 0.13, h * 0.99, 0.95, tape, 0, h / 2, 0.49);
            addBox(group, w * 0.96, 0.09, 0.95, tape, 0, h - 0.055, 0.49);
            for (const x of [-w * 0.46, w * 0.46]) {
                addBox(group, 0.035, h * 0.94, 0.035, cardboardSide, x, h / 2, 0.48);
            }
            // The original centre tape sits proud of the crate face. Put the label
            // on a raised front plate so it cannot disappear inside the tape geometry.
            const labelW = Math.max(0.88, w * 0.91);
            const labelH = Math.max(0.48, h * 0.64);
            const labelY = h * 0.57;
            addBox(group, labelW + 0.14, labelH + 0.14, 0.065,
                mat('#e6c77d', 0.42, 0.16), 0.06, labelY, 1.002);
            addBox(group, labelW + 0.08, labelH + 0.08, 0.055,
                mat('#142637', 0.34, 0.18), 0.06, labelY, 1.028);
            const sticker = mesh(new THREE.PlaneGeometry(labelW, labelH),
                new THREE.MeshBasicMaterial({
                    map: labelTexture(o.label || 'RESUME', '#173449', '#fff4d7'),
                    toneMapped: false,
                    depthWrite: false
                }),
                group, { x: 0.06, y: labelY, z: 1.061 });
            sticker.renderOrder = 8;
            group.position.set((o.x + o.w / 2 - layout.LW / 2) * scale, layout.groundY, 1.3);

        } else if (o.type === 'flag') {
            // Hanging interview/rejection banner with a steel rail and weighted lower hem.
            const poleH = 4.75;
            addBox(group, 0.09, poleH, 0.12, darkMetal, -0.05, poleH / 2, 0);
            addBox(group, 0.10, poleH, 0.12, darkMetal, 0.05, poleH / 2, -0.1);
            addBox(group, 1.5, 0.09, 0.13, darkMetal, 0, poleH, 0);
            const signW = Math.max(1.85, o.w * scale * 1.35);
            const bannerTexture = labelTexture(o.label || 'REJECT', '#842b35', '#fff8e9');
            const fabric = new THREE.MeshBasicMaterial({
                map: bannerTexture, side: THREE.DoubleSide, toneMapped: false
            });
            const banner = mesh(new THREE.PlaneGeometry(signW, 2.45, 8, 4), fabric,
                group, { x: 0, y: 3.12, z: 0.16 });
            const positions = banner.geometry.attributes.position;
            for (let i = 0; i < positions.count; i++) {
                const x = positions.getX(i);
                const y = positions.getY(i);
                positions.setZ(i, Math.sin((x / signW) * Math.PI * 4) * 0.045 * (1 - Math.abs(y) / 1.3));
            }
            positions.needsUpdate = true;
            banner.geometry.computeVertexNormals();
            addBox(group, signW + 0.1, 0.10, 0.14, darkMetal, 0, 4.38, 0.16);
            addBox(group, signW + 0.1, 0.10, 0.14, darkMetal, 0, 1.88, 0.16);
            for (let i = 0; i < 5; i++) {
                mesh(new THREE.SphereGeometry(0.045, 8, 6), tape, group,
                    { x: -signW * 0.43 + i * signW * 0.215, y: 4.37, z: 0.25 });
            }
            group.position.set((o.x + o.w / 2 - layout.LW / 2) * scale, layout.groundY - 0.5, 1.4);
            group.userData.banner = banner;

        } else if (o.type === 'drone') {
            // Recruiter/security drone with four arms, rotors, camera and status lights.
            const shell = mat('#596570', 0.4, 0.54);
            const shellDark = mat('#222d37', 0.34, 0.68);
            const droneBody = mesh(new THREE.CapsuleGeometry(0.30, 0.76, 6, 16), shell,
                group, { x: 0, y: 0, z: 0 });
            droneBody.rotation.z = Math.PI / 2;
            const belly = mesh(new THREE.SphereGeometry(0.25, 16, 12), shellDark,
                group, { x: 0.02, y: -0.18, z: 0.08 });
            const cameraLens = mesh(new THREE.SphereGeometry(0.095, 16, 12),
                new THREE.MeshStandardMaterial({ color: '#192a36', metalness: 0.82, roughness: 0.15,
                    emissive: '#3d8fbd', emissiveIntensity: 0.65 }),
                group, { x: 0.32, y: -0.02, z: 0.23 });
            const propellers = [];
            for (const [x, z] of [[-0.78, -0.32], [-0.78, 0.32], [0.78, -0.32], [0.78, 0.32]]) {
                addBox(group, 0.72, 0.06, 0.07, shellDark, x * 0.5, 0.05, z);
                const rotor = mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.045, 24), shellDark,
                    group, { x, y: 0.12, z });
                rotor.rotation.x = Math.PI / 2;
                propellers.push(rotor);
                const blade = addBox(group, 0.49, 0.025, 0.055, mat('#b5bec4', 0.42, 0.55), x, 0.15, z);
                propellers.push(blade);
            }
            const redLight = mesh(new THREE.SphereGeometry(0.055, 10, 8),
                new THREE.MeshBasicMaterial({ color: '#f04f4f' }), group,
                { x: -0.4, y: -0.13, z: 0.24 });
            const greenLight = mesh(new THREE.SphereGeometry(0.055, 10, 8),
                new THREE.MeshBasicMaterial({ color: '#75d68b' }), group,
                { x: 0.4, y: -0.13, z: 0.24 });
            group.position.set((o.x + o.w / 2 - layout.LW / 2) * scale,
                (layout.GY - o.y) * scale + layout.groundY, 1.55);
            group.userData.propellers = propellers;

        } else {
            // Heavy rubber pressure ball with raised seam rings and reflective panels.
            const ball = mesh(new THREE.SphereGeometry(0.62, 32, 24),
                mat('#873f3b', 0.46, 0.12), group, { x: 0, y: 0.62, z: 0 });
            ball.scale.set(1.12, 0.95, 0.95);
            const seamMat = mat('#d6b29a', 0.52, 0.16);
            const seam1 = mesh(new THREE.TorusGeometry(0.48, 0.025, 8, 40), seamMat,
                group, { x: 0, y: 0.62, z: 0.43 });
            seam1.scale.set(1.15, 1.0, 0.72);
            const seam2 = mesh(new THREE.TorusGeometry(0.48, 0.025, 8, 40), seamMat,
                group, { x: 0, y: 0.62, z: 0.43 });
            seam2.rotation.z = Math.PI / 2;
            seam2.scale.set(1.15, 1.0, 0.72);
            group.position.set((o.x + o.w / 2 - layout.LW / 2) * scale, layout.groundY, 1.45);
            group.userData.ball = ball;
        }
        return group;
    }

    function createCoin(item) {
        const group = new THREE.Group();
        const gold = new THREE.MeshStandardMaterial({
            color: '#f3c34f', metalness: 0.86, roughness: 0.2,
            emissive: '#80500d', emissiveIntensity: 0.24
        });
        const rim = mat('#a96c17', 0.24, 0.9);
        mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.105, 36), rim, group).rotation.x = Math.PI / 2;
        const face = mesh(new THREE.CircleGeometry(0.245, 36), gold, group, { x: 0, y: 0, z: 0.06 });
        const inner = mesh(new THREE.TorusGeometry(0.185, 0.018, 8, 36),
            mat('#ffedb3', 0.2, 0.75), group, { x: 0, y: 0, z: 0.075 });
        const emblemTexture = makeCanvasTexture((g, w, h) => {
            g.clearRect(0, 0, w, h);
            g.fillStyle = '#fff4c7';
            g.font = '900 118px Arial';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText('$', w / 2, h / 2 + 4);
        }, 256, 256);
        const emblem = mesh(new THREE.PlaneGeometry(0.25, 0.25),
            new THREE.MeshBasicMaterial({ map: emblemTexture, transparent: true }),
            group, { x: 0, y: 0, z: 0.085 });
        group.userData.face = face;
        group.userData.inner = inner;
        group.userData.emblem = emblem;
        group.position.set((item.x - layout.LW / 2) * layout.scale,
            layout.groundY + item.h * layout.scale, 2.0);
        return group;
    }

    function createPower(item) {
        const group = new THREE.Group();
        const isShield = item.kind === 'shield';
        const color = isShield ? '#86c9ec' : '#db9b5c';
        const core = mesh(new THREE.OctahedronGeometry(0.4, 1),
            new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.22, emissive: color, emissiveIntensity: 0.5 }), group);
        const ring = mesh(new THREE.TorusGeometry(0.55, 0.035, 8, 32), mat('#f5dfbd', 0.35, 0.45), group);
        ring.rotation.x = Math.PI / 2;
        group.position.set((item.x - layout.LW / 2) * layout.scale,
            layout.groundY + item.h * layout.scale, 2.0);
        group.userData.core = core;
        return group;
    }

    function createDoor(door) {
        const group = new THREE.Group();
        const frame = mat('#9aaab4', 0.30, 0.72);
        const frameDark = mat('#344654', 0.34, 0.56);
        const frameHighlight = mat('#e1e7e8', 0.22, 0.72);
        const glass = new THREE.MeshStandardMaterial({
            color: '#b8d9e5', roughness: 0.18, metalness: 0.24,
            transparent: true, opacity: 0.36
        });

        // Full-height double-door frame and glass backing.
        addBox(group, 0.19, 4.55, 0.28, frame, -1.27, 2.275, 0);
        addBox(group, 0.19, 4.55, 0.28, frame, 1.27, 2.275, 0);
        addBox(group, 2.72, 0.20, 0.30, frame, 0, 4.55, 0);
        addBox(group, 2.34, 0.12, 0.30, frameHighlight, 0, 0.11, 0.035);
        addBox(group, 1.12, 3.95, 0.07, glass, -0.57, 2.20, -0.13);
        addBox(group, 1.12, 3.95, 0.07, glass, 0.57, 2.20, -0.13);

        // The label is no longer a small plaque. It fills almost the entire door,
        // just like the bold entrance panel in the original game presentation.
        const panelTexture = doorPanelTexture(door.label || 'OFFER', !!door.final);
        const fullDoorFace = mesh(
            new THREE.PlaneGeometry(2.28, 3.92),
            new THREE.MeshBasicMaterial({ map: panelTexture, toneMapped: false }),
            group,
            { x: 0, y: 2.20, z: 0.035 }
        );
        fullDoorFace.renderOrder = 8;

        // Outer frame edges and top transom remain visible around the full-door graphic.
        addBox(group, 0.10, 4.08, 0.13, frameDark, -1.13, 2.20, 0.105);
        addBox(group, 0.10, 4.08, 0.13, frameDark, 1.13, 2.20, 0.105);
        addBox(group, 2.28, 0.12, 0.13, frameDark, 0, 4.18, 0.105);

        // Keep the label unobstructed. Handles sit near the outer edges rather
        // than cutting through the lettering in the middle of the door.
        addBox(group, 0.05, 0.68, 0.07, frameHighlight, -0.93, 1.95, 0.17);
        addBox(group, 0.05, 0.68, 0.07, frameHighlight, 0.93, 1.95, 0.17);

        // Warm lobby glow shows through the surrounding glass at the edges.
        const lobbyGlow = mesh(
            new THREE.PlaneGeometry(2.02, 3.5),
            new THREE.MeshBasicMaterial({
                color: '#ffe0ad', transparent: true, opacity: 0.12,
                depthWrite: false
            }),
            group,
            { x: 0, y: 2.02, z: -0.22 }
        );
        lobbyGlow.renderOrder = -1;

        addBox(group, 2.86, 0.20, 1.08, mat('#aab3b5', 0.7, 0.12), 0, -0.09, 0.27);
        addBox(group, 2.62, 0.08, 0.98, mat('#e1dfd7', 0.62, 0.04), 0, -0.20, 0.27);

        group.position.set(
            (door.x + door.w / 2 - layout.LW / 2) * layout.scale,
            layout.groundY,
            1.55
        );
        return group;
    }

    function syncMap(map, items, create, update) {
        const active = new Set(items);
        for (const [key, object] of map) {
            if (!active.has(key)) {
                worldItems.remove(object);
                disposeTree(object);
                map.delete(key);
            }
        }
        for (const item of items) {
            let object = map.get(item);
            if (!object) {
                object = create(item);
                map.set(item, object);
                worldItems.add(object);
            }
            update(object, item);
        }
    }

    let slideBlend = 0;
    let lastPlayerAnimTime = 0;

    function updatePlayer(s, elapsed) {
        if (!player) createPlayer();

        const scale = layout.scale;
        const sizeScale = scale / (10 / 338);
        const x = (s.PX - s.LW / 2) * scale;
        const rig = player.userData.rig;
        const running = s.state === 'playing' || s.state === 'countdown' || s.state === 'menu';
        const phase = s.runPhase || elapsed * 7;
        const swing = running ? Math.sin(phase) * 0.72 : 0;
        const airborne = s.py > 1 || s.vy > 0;
        const sliding = !!s.sliding && !airborne;

        const frameDelta = Math.max(0, Math.min(0.05, elapsed - lastPlayerAnimTime));
        lastPlayerAnimTime = elapsed;
        slideBlend = THREE.MathUtils.damp(slideBlend, sliding ? 1 : 0, 13, frameDelta);
        const t = slideBlend;
        const mix = (a, b) => THREE.MathUtils.lerp(a, b, t);

        // Forward dive: the legs lead to the right while the head trails behind.
        // Keep a strong diagonal angle rather than rotating all the way to horizontal.
        const diveAngle = THREE.MathUtils.degToRad(56);
        const slideXOffset = -0.03 * sizeScale * t;
        const slideYOffset = 0.035 * sizeScale * t;
        const y = layout.groundY + s.py * scale + slideYOffset;

        player.position.set(x + slideXOffset, y, 3.2);
        player.scale.set(sizeScale, sizeScale, sizeScale);

        // The whole body inclines as one piece. No squashing or height reduction.
        rig.torso.position.set(0, 1.44, 0);
        rig.torso.rotation.z = mix(airborne ? -0.17 : -0.10, -0.035);
        rig.headGroup.position.set(0.075, 2.18, 0.015);
        rig.headGroup.rotation.z = mix(airborne ? 0.08 : 0, -0.065);
        rig.bag.position.set(-0.39, 1.34, -0.20);
        rig.bag.rotation.z = mix(0, -0.08);

        // Extend the legs into the direction of travel. A slight knee bend keeps
        // the pose looking like a dive rather than a rigid plank.
        rig.leftLeg.upper.rotation.z = mix(airborne ? 0.52 : swing, 0.02);
        rig.rightLeg.upper.rotation.z = mix(airborne ? -0.56 : -swing, -0.04);
        rig.leftLeg.lower.rotation.z = mix(
            airborne ? -0.85 : Math.max(0, -swing) * 0.7,
            -0.22
        );
        rig.rightLeg.lower.rotation.z = mix(
            airborne ? -0.72 : Math.max(0, swing) * 0.7,
            -0.14
        );

        // Arms sweep back alongside the torso, away from the leading legs.
        rig.leftArm.upper.position.set(-0.25, 1.72, 0.15);
        rig.rightArm.upper.position.set(0.23, 1.72, -0.12);
        rig.leftArm.upper.rotation.z = mix(airborne ? -0.92 : -swing * 0.82, -1.48);
        rig.rightArm.upper.rotation.z = mix(airborne ? 0.88 : swing * 0.82, -1.24);
        rig.leftArm.lower.rotation.z = mix(
            airborne ? -0.36 : -0.18 - Math.max(0, swing) * 0.3,
            0.72
        );
        rig.rightArm.lower.rotation.z = mix(
            airborne ? 0.36 : 0.18 + Math.max(0, -swing) * 0.3,
            0.58
        );

        // Positive rotation tips the head back/left and brings the legs forward/right.
        // 56 degrees gives a clear dive silhouette without lying completely flat.
        const hitTilt = s.shake > 0 && !airborne
            ? Math.sin(elapsed * 32) * 0.025
            : 0;
        player.rotation.z = diveAngle * t + hitTilt;

        // Running bounce only applies while upright. The dive glides smoothly.
        if (running && !airborne && t < 0.01) {
            player.position.y += Math.abs(Math.sin(phase * 2)) * 0.025 * sizeScale;
        }

        // Original plain circular shield, independent of the body angle.
        // This matches the old robot's pale fill and dashed blue outline.
        if (shieldVisual) {
            shieldVisual.visible = !!s.shield;
            shieldVisual.position.set(
                x,
                layout.groundY + (28 * scale) + s.py * scale,
                4.15
            );
        }

        const flicker = s.invuln > 0 && Math.floor(elapsed * 18) % 2 === 0;
        player.visible = !flicker;

        // The ground shadow becomes wider during the forward dive.
        playerShadow.position.set(x + slideXOffset, layout.groundY + 0.02, 2.76);
        const shadowScale = Math.max(0.42, 1 - s.py / 260);
        playerShadow.scale.set(
            shadowScale * sizeScale * (1 + 0.85 * t),
            shadowScale * 0.2 * sizeScale,
            1
        );
        playerShadow.material.opacity = 0.24 * shadowScale;
    }

    function updateWorldMotion(s) {
        if (!layout) return;
        const scrollPx = s.scroll || 0;

        // Each skyline layer moves continuously at its own parallax speed.
        // Objects wrap only after leaving the camera view, so there is no whole-scene snap.
        for (const track of sceneryTracks) {
            const offset = scrollPx * layout.scale * track.speed;
            const half = track.span / 2;
            let x = (track.baseX - offset + half) % track.span;
            if (x < 0) x += track.span;
            track.object.position.x = x - half;
        }

        // Foreground seams and lane markings move faster to sell the runner's speed.
        const offset = (scrollPx * layout.scale * 0.52) % (layout.worldWidth * 3);
        groundMarkers.forEach(marker => {
            if (marker.userData.baseX == null) marker.userData.baseX = marker.position.x;
            let x = (marker.userData.baseX - offset + layout.worldWidth * 1.5) % (layout.worldWidth * 3);
            if (x < 0) x += layout.worldWidth * 3;
            marker.position.x = x - layout.worldWidth * 1.5;
        });

        // A tiny road-texture drift adds motion without shaking the player or camera.
        if (roadMaterial && roadMaterial.map) {
            roadMaterial.map.offset.x = -((scrollPx * layout.scale * 0.018) % 1);
        }
    }

    function capture() {
        renderer.render(scene, camera);
        const webglCanvas = renderer.domElement;
        const hudCanvas = document.getElementById('mazeCanvas');
        const output = document.createElement('canvas');
        output.width = webglCanvas.width;
        output.height = webglCanvas.height;
        const context = output.getContext('2d');
        context.drawImage(webglCanvas, 0, 0, output.width, output.height);
        if (hudCanvas) context.drawImage(hudCanvas, 0, 0, output.width, output.height);
        return output;
    }

    function render(s) {
        if (!s || !Number.isFinite(s.LW) || !Number.isFinite(s.LH)) return;
        const key = `${s.LW}|${s.LH}|${s.GY}`;
        if (key !== currentLayout) {
            currentLayout = key;
            buildEnvironment(s);
        }

        applyRoundTheme(Number.isFinite(s.roundIndex) ? s.roundIndex : 0);
        const elapsed = clock.getElapsedTime();
        updatePlayer(s, elapsed);
        updateWorldMotion(s);

        syncMap(obstacleMeshes, (s.obstacles || []).filter(o => !o.dead), createObstacle, (object, item) => {
            const scale = layout.scale;
            const x = (item.x + item.w / 2 - layout.LW / 2) * scale;
            if (item.type === 'crate') object.position.x = x;
            else if (item.type === 'flag') object.position.x = x;
            else if (item.type === 'drone') {
                object.position.x = x;
                object.position.y = layout.groundY + (layout.GY - item.y - Math.sin(item.t * 3) * 6) * scale;
            } else object.position.x = x;
            object.visible = !item.hit || Math.floor(elapsed * 16) % 2 === 0;
            if (item.type === 'ball' && object.userData.ball) {
                object.userData.ball.rotation.z = item.rot || elapsed * 2;
            }
            if (item.type === 'drone' && object.userData.propellers) {
                object.userData.propellers.forEach((part, index) => {
                    part.rotation.y = elapsed * (index % 2 ? 26 : -26);
                });
            }
            if (item.type === 'flag' && object.userData.banner) {
                object.userData.banner.rotation.y = Math.sin(elapsed * 2.2 + item.x * 0.01) * 0.055;
            }
        });

        syncMap(coinMeshes, s.coinItems || [], createCoin, (object, item) => {
            object.position.x = (item.x - layout.LW / 2) * layout.scale;
            object.position.y = layout.groundY + item.h * layout.scale;
            object.rotation.y = Math.sin((item.spin || 0) + elapsed * 3) * 0.85;
            object.rotation.z = Math.sin((item.spin || 0) + elapsed * 2) * 0.08;
            if (object.userData.inner) object.userData.inner.rotation.z = elapsed * 0.35;
        });

        syncMap(powerMeshes, s.powerItems || [], createPower, (object, item) => {
            object.position.x = (item.x - layout.LW / 2) * layout.scale;
            object.position.y = layout.groundY + item.h * layout.scale + Math.sin(elapsed * 2.5 + (item.t || 0)) * 0.08;
            object.rotation.y = elapsed * 0.9;
            object.rotation.z = elapsed * 0.45;
        });

        syncMap(doorMeshes, s.doors || [], createDoor, (object, item) => {
            object.position.x = (item.x + item.w / 2 - layout.LW / 2) * layout.scale;
        });

        // Subtle camera shake follows the existing hit feedback.
        camera.position.x = s.shake > 0 ? Math.sin(elapsed * 43) * Math.min(0.09, s.shake * 0.004) : 0;
        camera.position.y = s.shake > 0 ? Math.cos(elapsed * 37) * Math.min(0.06, s.shake * 0.003) : 0;
        renderer.render(scene, camera);
    }

    function resize() {
        const width = Math.max(1, wrap.clientWidth);
        const height = Math.max(1, wrap.clientHeight);
        renderer.setSize(width, height, false);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        // Keep the logical view proportions; game.js supplies the exact logical layout on render.
    }

    if (typeof ResizeObserver === 'function') {
        new ResizeObserver(resize).observe(wrap);
    } else {
        window.addEventListener('resize', resize);
    }
    resize();
    wrap.classList.add('has-3d');
    window.EscapeInterview3D = { render, capture };
    console.info('[Escape the Interview] 3D renderer ready.');
})();