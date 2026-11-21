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
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xc9b9b3);
    scene.fog = new THREE.Fog(0xc9b9b3, 27, 68);

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
    let groundMarkers = [];
    let ambientLight;
    let keyLight;
    let skyMesh;
    let skyMaterial;
    let roadMaterial;
    let curbMaterial;
    let roadSheenMaterial;
    let activeThemeIndex = -1;
    let buildingMaterials = [];
    let windowMaterials = [];

    // The four original rounds keep their own time-of-day identity.
    const ROUND_THEMES = [
        {
            name: 'Morning',
            skyTop: '#aaa2ce', skyMid: '#d7c9e8', horizon: '#f4d9d9',
            fog: '#d3c7df', background: '#d6cce2',
            hemi: '#d9d1f1', groundLight: '#514a61', sunlight: '#ffe5d0',
            sunIntensity: 2.35, buildingTint: '#b8b4c9', road: '#55535f',
            curb: '#b8b1bc', sheen: '#f1d3de', windowGlow: 0.35,
            lampGlow: 0.25, stars: false
        },
        {
            name: 'Afternoon',
            skyTop: '#7ea1c4', skyMid: '#e6c87f', horizon: '#f6d48d',
            fog: '#e7c58d', background: '#e6c991',
            hemi: '#f3d99d', groundLight: '#66503b', sunlight: '#fff0c2',
            sunIntensity: 3.1, buildingTint: '#d7c7a9', road: '#62594d',
            curb: '#c7b99d', sheen: '#f7dca7', windowGlow: 0.18,
            lampGlow: 0.15, stars: false
        },
        {
            name: 'Evening',
            skyTop: '#34476f', skyMid: '#7786b1', horizon: '#d39a9d',
            fog: '#7180a5', background: '#7280a2',
            hemi: '#9eadd8', groundLight: '#33394e', sunlight: '#ffc19a',
            sunIntensity: 1.85, buildingTint: '#9aa9c4', road: '#343d51',
            curb: '#77839c', sheen: '#d79da6', windowGlow: 0.8,
            lampGlow: 0.8, stars: false
        },
        {
            name: 'Night',
            skyTop: '#090f20', skyMid: '#17233b', horizon: '#34364f',
            fog: '#1b2235', background: '#151d30',
            hemi: '#6f7da8', groundLight: '#111522', sunlight: '#a9c6ff',
            sunIntensity: 0.72, buildingTint: '#68758e', road: '#171e2d',
            curb: '#343c4e', sheen: '#8292c2', windowGlow: 1.65,
            lampGlow: 1.8, stars: true
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
            g.font = '700 112px Arial, sans-serif';

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
                g.fillText(display, w / 2, h * 0.47);
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
            grad.addColorStop(0.55, theme.skyMid);
            grad.addColorStop(1, theme.horizon);
            g.fillStyle = grad;
            g.fillRect(0, 0, w, h);

            const glow = g.createRadialGradient(w * 0.76, h * 0.72, 4, w * 0.76, h * 0.72, h * 0.5);
            glow.addColorStop(0, theme.stars ? 'rgba(190,211,255,0.22)' : 'rgba(255,226,184,0.48)');
            glow.addColorStop(1, 'rgba(255,226,184,0)');
            g.fillStyle = glow;
            g.fillRect(0, 0, w, h);

            if (theme.stars) {
                for (let i = 0; i < 110; i++) {
                    const x = (Math.sin(i * 91.7) * 0.5 + 0.5) * w;
                    const y = (Math.sin(i * 37.1 + 2) * 0.5 + 0.5) * h * 0.72;
                    const r = i % 9 === 0 ? 2.3 : 1.1;
                    g.fillStyle = `rgba(235,241,255,${0.35 + (i % 5) * 0.11})`;
                    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
                }
                g.fillStyle = 'rgba(232,239,255,0.78)';
                g.beginPath(); g.arc(w * 0.78, h * 0.35, 28, 0, Math.PI * 2); g.fill();
                g.fillStyle = theme.skyTop;
                g.beginPath(); g.arc(w * 0.795, h * 0.325, 24, 0, Math.PI * 2); g.fill();
            } else {
                const sun = g.createRadialGradient(w * 0.77, h * 0.7, 3, w * 0.77, h * 0.7, 68);
                sun.addColorStop(0, 'rgba(255,244,211,0.95)');
                sun.addColorStop(0.55, 'rgba(255,220,176,0.34)');
                sun.addColorStop(1, 'rgba(255,220,176,0)');
                g.fillStyle = sun;
                g.fillRect(0, 0, w, h);
            }
        }, 1024, 512);
    }

    function concreteTexture() {
        return makeCanvasTexture((g, w, h) => {
            g.fillStyle = '#777b80';
            g.fillRect(0, 0, w, h);
            for (let i = 0; i < 9000; i++) {
                const x = Math.random() * w;
                const y = Math.random() * h;
                const a = Math.random() * 0.12;
                g.fillStyle = Math.random() > 0.5
                    ? `rgba(255,255,255,${a})`
                    : `rgba(12,18,25,${a})`;
                g.fillRect(x, y, Math.random() * 3 + 0.5, Math.random() * 2 + 0.5);
            }
            g.strokeStyle = 'rgba(35,42,48,0.22)';
            g.lineWidth = 2;
            for (let y = 64; y < h; y += 128) {
                g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + 2); g.stroke();
            }
        }, 1024, 512);
    }

    function labelTexture(label, bg = '#e8dfd2', fg = '#222a31') {
        return makeCanvasTexture((g, w, h) => {
            g.fillStyle = bg;
            g.fillRect(0, 0, w, h);
            g.strokeStyle = 'rgba(37,43,49,0.2)';
            g.lineWidth = 10;
            g.strokeRect(5, 5, w - 10, h - 10);
            g.fillStyle = fg;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.font = '800 56px Arial, sans-serif';
            const words = String(label || 'RESUME').split(' ');
            if (words.length > 1 && String(label).length > 12) {
                g.font = '800 42px Arial, sans-serif';
                g.fillText(words.slice(0, Math.ceil(words.length / 2)).join(' '), w / 2, h * 0.43);
                g.fillText(words.slice(Math.ceil(words.length / 2)).join(' '), w / 2, h * 0.63);
            } else {
                g.fillText(String(label || 'RESUME').slice(0, 22), w / 2, h * 0.53);
            }
        }, 512, 256);
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
        });
    }

    function addBrandSign(parent, name, x, y, z, width = 2.0) {
        const sign = new THREE.Group();
        sign.position.set(x, y, z);
        parent.add(sign);
        const panel = mat('#101923', 0.38, 0.28);
        addBox(sign, width + 0.16, 0.7, 0.13, panel, 0, 0, 0);
        const texture = brandTexture(name);
        const face = mesh(new THREE.PlaneGeometry(width, 0.56),
            new THREE.MeshBasicMaterial({ map: texture }), sign, { x: 0, y: 0, z: 0.075 });
        face.renderOrder = 3;
        return sign;
    }

    function addOfficeBuilding(parent, x, baseY, width, height, z, options = {}) {
        const group = new THREE.Group();
        group.position.set(x, baseY, z);
        parent.add(group);

        const style = options.style || 'glass';
        const depth = options.depth || 1.5;
        const baseColor = options.tint || '#263a49';
        const bodyMat = new THREE.MeshStandardMaterial({
            map: glassTexture(), color: baseColor,
            roughness: style === 'glass' ? 0.27 : 0.78,
            metalness: style === 'glass' ? 0.42 : 0.08
        });
        buildingMaterials.push(bodyMat);
        addBox(group, width, height, depth, bodyMat, 0, height / 2, 0);

        const frontZ = depth / 2 + 0.035;
        const frameMat = mat(style === 'concrete' ? '#89909a' : '#152733', 0.42, 0.52);
        const sideMat = mat('#172633', 0.38, 0.36);
        addBox(group, 0.18, height + 0.22, depth + 0.12, sideMat, -width / 2, height / 2, 0.02);
        addBox(group, 0.18, height + 0.22, depth + 0.12, sideMat, width / 2, height / 2, 0.02);
        addBox(group, width + 0.22, 0.2, depth + 0.16, frameMat, 0, height, 0.03);

        // Floor plates, columns and a darker glazed lobby at street level.
        const floors = Math.max(4, Math.floor(height / 1.45));
        for (let i = 1; i < floors; i++) {
            const y = (height / floors) * i;
            addBox(group, width + 0.08, 0.075, depth + 0.12, frameMat, 0, y, 0.055);
        }
        const columns = Math.max(3, Math.floor(width / 1.05));
        for (let i = 1; i < columns; i++) {
            const cx = -width / 2 + (width / columns) * i;
            addBox(group, 0.055, height - 0.2, 0.07, frameMat, cx, height / 2, frontZ);
        }

        const lobbyMat = new THREE.MeshStandardMaterial({
            color: '#233c4b', roughness: 0.24, metalness: 0.36,
            emissive: '#172c3a', emissiveIntensity: 0.15
        });
        windowMaterials.push(lobbyMat);
        addBox(group, width * 0.52, Math.min(1.5, height * 0.22), 0.08,
            lobbyMat, 0, Math.min(0.9, height * 0.12), frontZ + 0.07);

        // Exterior fins add depth and break up the flat glass wall.
        if (style !== 'concrete') {
            for (let i = 0; i < 3; i++) {
                const fx = -width * 0.34 + i * width * 0.34;
                addBox(group, 0.07, height - 0.4, 0.12, frameMat, fx, height / 2, frontZ + 0.07);
            }
        }

        if (options.brand) {
            const signWidth = Math.min(width * 0.55, options.brand.length > 6 ? 2.1 : 1.8);
            addBrandSign(group, options.brand, -width * 0.15, Math.min(height - 1.2, height * 0.46), frontZ + 0.12, signWidth);
        }

        // Air-conditioning units and roof parapet details.
        for (let i = 0; i < 2; i++) {
            addBox(group, 0.7, 0.32, 0.62, mat('#46535d', 0.8, 0.12),
                -width * 0.25 + i * width * 0.5, height + 0.25, -0.05);
        }
        return group;
    }

    function buildEnvironment(s) {
        clearGroup(environment);
        clearGroup(worldItems);
        obstacleMeshes.clear();
        coinMeshes.clear();
        powerMeshes.clear();
        doorMeshes.clear();
        groundMarkers = [];
        buildingMaterials = [];
        windowMaterials = [];
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

        ambientLight = new THREE.HemisphereLight(0xdcecff, 0x51453f, 1.8);
        environment.add(ambientLight);
        keyLight = new THREE.DirectionalLight(0xffd1a1, 2.8);
        keyLight.position.set(-8, 12, 16);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.set(1024, 1024);
        keyLight.shadow.camera.left = -24;
        keyLight.shadow.camera.right = 24;
        keyLight.shadow.camera.top = 16;
        keyLight.shadow.camera.bottom = -16;
        keyLight.shadow.bias = -0.0003;
        environment.add(keyLight);

        // Large sky plane with round-specific atmosphere.
        skyMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', depthWrite: false, fog: false });
        skyMesh = mesh(new THREE.PlaneGeometry(worldWidth * 4.8, 26), skyMaterial,
            environment, { x: 0, y: 1.0, z: -29 });
        skyMesh.renderOrder = -5;

        // Long urban skyline. Buildings overlap slightly so no empty gaps appear
        // as the side-scrolling background drifts across the screen.
        const buildings = [
            { x: -2.02, w: 5.5, h: 11.3, z: -23, style: 'concrete', tint: '#596675' },
            { x: -1.20, w: 4.8, h: 14.0, z: -21, style: 'glass', brand: 'google', tint: '#294456' },
            { x: -0.57, w: 4.9, h: 10.2, z: -18, style: 'glass', brand: 'amazon', tint: '#344c5d' },
            { x: 0.00, w: 4.9, h: 13.0, z: -20, style: 'concrete', brand: 'meta', tint: '#566171' },
            { x: 0.57, w: 5.0, h: 11.7, z: -18.5, style: 'glass', brand: 'nvidia', tint: '#294554' },
            { x: 1.20, w: 5.0, h: 14.4, z: -21.5, style: 'glass', brand: 'openai', tint: '#354b5a' },
            { x: 1.85, w: 5.0, h: 10.8, z: -18, style: 'concrete', brand: 'netflix', tint: '#5b626f' },
            { x: 2.50, w: 5.2, h: 12.8, z: -22.5, style: 'glass', brand: 'microsoft', tint: '#344c5e' },
            { x: 3.15, w: 5.2, h: 9.9, z: -19, style: 'glass', tint: '#354958' }
        ];
        buildings.forEach((b, i) => {
            addOfficeBuilding(
                environment,
                b.x * worldWidth * 0.30,
                groundY - 0.15,
                b.w,
                b.h,
                b.z,
                b
            );
        });

        // A lower row of distant towers creates city depth behind the main skyline.
        const farTints = ['#72788b', '#68778a', '#7a8292', '#5e6e80'];
        for (let i = -5; i <= 5; i++) {
            const w = 4.2 + (i % 3 + 3) % 3 * 0.7;
            const h = 7.4 + ((i * 7 + 40) % 5) * 0.8;
            const tower = addOfficeBuilding(
                environment,
                i * worldWidth * 0.39,
                groundY - 0.05,
                w,
                h,
                -26 - (i % 2) * 1.5,
                { style: 'glass', tint: farTints[(i + 20) % farTints.length], depth: 1.0 }
            );
            tower.scale.setScalar(0.92);
        }

        // Keep just a couple of trees. Buildings remain the dominant backdrop.
        addTree(environment, -worldWidth * 0.47, groundY + 0.42, -5.8, 0.86);
        addTree(environment, worldWidth * 0.91, groundY + 0.42, -6.0, 0.78);

        // Street furniture and a few compact planters, rather than a tree-lined park.
        const planterMat = mat('#46534f', 0.82, 0.08);
        const shrubMat = mat('#354b40', 0.95);
        for (const x of [-worldWidth * 0.24, worldWidth * 0.56]) {
            addBox(environment, 1.65, 0.46, 0.95, planterMat, x, groundY + 0.25, -3.8);
            for (let k = 0; k < 3; k++) {
                const shrub = mesh(new THREE.IcosahedronGeometry(0.32, 1), shrubMat,
                    environment, { x: x - 0.42 + k * 0.42, y: groundY + 0.7, z: -3.62 });
                shrub.scale.set(1.15, 0.72, 0.8);
            }
        }

        // Streetlights, each with a compact warm fixture.
        for (const x of [-worldWidth * 0.74, -worldWidth * 0.03, worldWidth * 0.72]) {
            const poleMat = mat('#303b45', 0.34, 0.68);
            addBox(environment, 0.075, 3.6, 0.08, poleMat, x, groundY + 1.8, -1.4);
            addBox(environment, 0.52, 0.075, 0.12, poleMat, x + 0.22, groundY + 3.58, -1.4);
            const lampMat = new THREE.MeshStandardMaterial({
                color: '#ffe5b8', emissive: '#ffc477', emissiveIntensity: 0.55,
                roughness: 0.32
            });
            windowMaterials.push(lampMat);
            const lamp = mesh(new THREE.BoxGeometry(0.27, 0.11, 0.2), lampMat,
                environment, { x: x + 0.41, y: groundY + 3.5, z: -1.3 });
            lamp.castShadow = false;
        }

        // Asphalt, curb and reflective road surface.
        const bottomY = -5.4;
        const roadHeight = Math.max(0.4, groundY - bottomY);
        roadMaterial = new THREE.MeshStandardMaterial({
            map: concreteTexture(), color: '#55545a', roughness: 0.38, metalness: 0.16
        });
        addBox(environment, worldWidth * 3.2, roadHeight, 2.15,
            roadMaterial, 0, (groundY + bottomY) / 2, 1.7);

        curbMaterial = mat('#aaa5a0', 0.7, 0.04);
        addBox(environment, worldWidth * 3.2, 0.28, 2.35,
            curbMaterial, 0, groundY - 0.15, 1.05);
        addBox(environment, worldWidth * 3.2, 0.045, 2.4,
            mat('#d6d0c9', 0.48), 0, groundY - 0.015, 0.98);

        roadSheenMaterial = new THREE.MeshBasicMaterial({
            color: '#e5bda0', transparent: true, opacity: 0.12
        });
        for (let i = 0; i < 27; i++) {
            const x = -worldWidth * 1.45 + i * worldWidth * 0.11;
            const y = bottomY + 0.3 + (i % 5) * 0.17;
            const streak = addBox(environment, 0.48 + (i % 4) * 0.28, 0.022, 0.012,
                roadSheenMaterial, x, y, 2.82);
            streak.rotation.z = i % 2 ? 0.018 : -0.014;
        }

        // Pavement seams and dashed road markings.
        const tileLineMat = new THREE.MeshBasicMaterial({
            color: '#d4cbc2', transparent: true, opacity: 0.32
        });
        for (let i = 0; i < 19; i++) {
            const line = addBox(environment, 0.018, 0.42, 0.015, tileLineMat,
                -worldWidth * 1.35 + i * worldWidth * 0.15, groundY - 0.41, 2.87);
            groundMarkers.push(line);
        }
        const dashMat = new THREE.MeshBasicMaterial({
            color: '#d8c2b2', transparent: true, opacity: 0.22
        });
        for (let i = 0; i < 12; i++) {
            const dash = addBox(environment, 0.95, 0.032, 0.02, dashMat,
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
        if (!scene.fog) scene.fog = new THREE.Fog(theme.fog, 28, 72);
        scene.fog.color.set(theme.fog);
        scene.fog.near = index === 3 ? 18 : 30;
        scene.fog.far = index === 3 ? 55 : 78;

        if (ambientLight) {
            ambientLight.color.set(theme.hemi);
            ambientLight.groundColor.set(theme.groundLight);
            ambientLight.intensity = index === 3 ? 1.25 : 1.75;
        }
        if (keyLight) {
            keyLight.color.set(theme.sunlight);
            keyLight.intensity = theme.sunIntensity;
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
        const shirt = mat('#eeece5', 0.94);
        const shirtShadow = mat('#c6c7c2', 0.9);
        const shirtSeam = mat('#aeb2b1', 0.94);
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
        const head = mesh(new THREE.SphereGeometry(0.255, 28, 22), skin, group,
            { x: 0.075, y: 2.18, z: 0.015 });
        head.scale.set(0.88, 1.06, 0.88);
        mesh(new THREE.SphereGeometry(0.075, 16, 12), skin, group,
            { x: -0.13, y: 2.16, z: 0.17 });
        mesh(new THREE.SphereGeometry(0.03, 10, 8), skinShade, group,
            { x: -0.15, y: 2.16, z: 0.231 });
        // Nose, brow, eye and mouth are placed on the visible side profile.
        mesh(new THREE.SphereGeometry(0.052, 14, 10), skin, group,
            { x: 0.285, y: 2.13, z: 0.06 });
        mesh(new THREE.SphereGeometry(0.026, 10, 8), mat('#17191d', 0.6), group,
            { x: 0.18, y: 2.22, z: 0.226 });
        mesh(new THREE.SphereGeometry(0.03, 10, 8), hair, group,
            { x: 0.18, y: 2.255, z: 0.227 });
        addBox(group, 0.10, 0.018, 0.025, hair, 0.17, 2.275, 0.22);
        addBox(group, 0.085, 0.014, 0.015, skinShade, 0.25, 2.04, 0.19);

        // Wavy dark hair, with separate curls to avoid a plastic helmet silhouette.
        const cap = mesh(new THREE.SphereGeometry(0.27, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.58),
            hair, group, { x: 0.04, y: 2.29, z: -0.005 });
        cap.scale.set(1.04, 0.86, 0.96);
        const curls = [
            [-0.17, 2.35, 0.10, 0.105], [-0.06, 2.48, 0.07, 0.11],
            [0.08, 2.47, 0.08, 0.10], [0.20, 2.40, 0.04, 0.085],
            [-0.23, 2.25, 0.13, 0.09], [-0.21, 2.14, 0.08, 0.075]
        ];
        curls.forEach((c, i) => {
            const curl = mesh(new THREE.SphereGeometry(c[3], 12, 10),
                i % 2 ? hairHighlight : hair, group,
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

        group.userData.rig = { leftLeg, rightLeg, leftArm, rightArm, torso, head };
        const shieldRing = mesh(new THREE.TorusGeometry(0.92, 0.045, 10, 48),
            new THREE.MeshStandardMaterial({
                color: '#a9d9f4', emissive: '#6bb9e8', emissiveIntensity: 0.7,
                transparent: true, opacity: 0.58, roughness: 0.28, metalness: 0.25
            }), group, { x: 0, y: 1.15, z: 0.25 });
        shieldRing.rotation.y = Math.PI / 2;
        group.userData.shieldRing = shieldRing;

        playerShadow = mesh(new THREE.CircleGeometry(0.62, 32),
            new THREE.MeshBasicMaterial({ color: '#15191e', transparent: true, opacity: 0.23, depthWrite: false }),
            characterLayer, { x: 0, y: layout.groundY + 0.015, z: 2.75 });
        playerShadow.scale.set(1, 0.2, 1);
    }

    function createObstacle(o) {
        const group = new THREE.Group();
        const scale = layout.scale;
        const cardboard = mat('#a77a51', 0.96);
        const cardboardSide = mat('#76543a', 0.96);
        const tape = mat('#c7a66f', 0.83);
        const darkMetal = mat('#26333d', 0.36, 0.68);
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
            const labelW = Math.max(0.55, w * 0.68);
            const labelH = Math.max(0.26, h * 0.34);
            const sticker = mesh(new THREE.PlaneGeometry(labelW, labelH),
                new THREE.MeshBasicMaterial({ map: labelTexture(o.label || 'RESUME', '#ece8df', '#30343a') }),
                group, { x: 0.06, y: h * 0.58, z: 0.505 });
            sticker.renderOrder = 2;
            // Tracking barcode and small handling marks.
            addBox(group, labelW * 0.58, 0.06, 0.012, mat('#242b31', 0.9), 0.02, h * 0.36, 0.514);
            for (let i = 0; i < 6; i++) {
                addBox(group, 0.018 + (i % 2) * 0.012, 0.14, 0.012, mat('#292d32', 0.9),
                    -labelW * 0.28 + i * labelW * 0.105, h * 0.35, 0.518);
            }
            group.position.set((o.x + o.w / 2 - layout.LW / 2) * scale, layout.groundY, 1.3);

        } else if (o.type === 'flag') {
            // Hanging interview/rejection banner with a steel rail and weighted lower hem.
            const poleH = 4.75;
            addBox(group, 0.09, poleH, 0.12, darkMetal, -0.05, poleH / 2, 0);
            addBox(group, 0.10, poleH, 0.12, darkMetal, 0.05, poleH / 2, -0.1);
            addBox(group, 1.5, 0.09, 0.13, darkMetal, 0, poleH, 0);
            const signW = Math.max(1.85, o.w * scale * 1.35);
            const bannerTexture = labelTexture(o.label || 'REJECT', '#a94946', '#fff0e6');
            const fabric = new THREE.MeshStandardMaterial({
                map: bannerTexture, color: '#e9d8cb', roughness: 0.94, side: THREE.DoubleSide
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
        const frame = mat('#26333d', 0.28, 0.78);
        const frameHighlight = mat('#8b969e', 0.25, 0.72);
        const glass = new THREE.MeshStandardMaterial({
            color: '#8da9b7', roughness: 0.16, metalness: 0.34,
            transparent: true, opacity: 0.54
        });
        const darkGlass = new THREE.MeshStandardMaterial({
            color: '#243b4e', roughness: 0.2, metalness: 0.42,
            transparent: true, opacity: 0.84
        });

        // Two glass entrance leaves, framed with brushed metal.
        addBox(group, 0.16, 4.45, 0.24, frame, -1.2, 2.225, 0);
        addBox(group, 0.16, 4.45, 0.24, frame, 1.2, 2.225, 0);
        addBox(group, 2.48, 0.18, 0.26, frame, 0, 4.45, 0);
        addBox(group, 2.12, 0.10, 0.28, frameHighlight, 0, 0.12, 0.02);
        addBox(group, 1.08, 3.86, 0.06, glass, -0.55, 2.14, -0.13);
        addBox(group, 1.08, 3.86, 0.06, darkGlass, 0.55, 2.14, -0.13);

        // Door stile and transom glazing.
        addBox(group, 0.075, 3.92, 0.12, frame, 0, 2.14, -0.03);
        addBox(group, 2.13, 0.10, 0.10, frame, 0, 3.68, -0.015);
        addBox(group, 2.32, 0.66, 0.08, glass, 0, 4.04, -0.12);

        // Vertical brushed handles.
        addBox(group, 0.045, 0.78, 0.06, frameHighlight, -0.13, 2.1, 0.11);
        addBox(group, 0.045, 0.78, 0.06, frameHighlight, 0.13, 2.1, 0.11);
        for (const x of [-1.2, 1.2]) {
            mesh(new THREE.SphereGeometry(0.07, 12, 10), mat('#d1d7d8', 0.22, 0.78),
                group, { x, y: 4.43, z: 0.15 });
        }

        // Illuminated round/offer plaque above the entrance.
        const plaqueTexture = labelTexture(door.label || 'OFFER', '#f1e4d2', '#28313a');
        const plaqueBack = mat('#1c2933', 0.3, 0.55);
        addBox(group, 2.06, 0.58, 0.16, plaqueBack, 0, 4.88, 0.02);
        const plaque = mesh(new THREE.PlaneGeometry(1.92, 0.48),
            new THREE.MeshBasicMaterial({ map: plaqueTexture }),
            group, { x: 0, y: 4.88, z: 0.11 });
        plaque.renderOrder = 3;

        // Warm lobby light behind the glass and a stone threshold.
        const lobbyGlow = mesh(new THREE.PlaneGeometry(1.95, 3.55),
            new THREE.MeshBasicMaterial({ color: '#e5b985', transparent: true, opacity: 0.14 }),
            group, { x: 0, y: 2.0, z: -0.23 });
        lobbyGlow.renderOrder = -1;
        addBox(group, 2.72, 0.18, 1.05, mat('#81888d', 0.72, 0.08), 0, -0.08, 0.25);
        addBox(group, 2.5, 0.08, 0.95, mat('#c7c5bf', 0.66), 0, -0.18, 0.25);

        group.position.set((door.x + door.w / 2 - layout.LW / 2) * layout.scale,
            layout.groundY, 1.45);
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

    function updatePlayer(s, elapsed) {
        if (!player) createPlayer();
        const scale = layout.scale;
        const x = (s.PX - s.LW / 2) * scale;
        const y = layout.groundY + s.py * scale;
        player.position.set(x, y, 3.2);

        // Match the legacy 338px logical-height character scale.
        const sizeScale = scale / (10 / 338);
        const rig = player.userData.rig;
        const running = s.state === 'playing' || s.state === 'countdown' || s.state === 'menu';
        const phase = s.runPhase || elapsed * 7;
        const swing = running ? Math.sin(phase) * 0.72 : 0;
        const airborne = s.py > 1 || s.vy > 0;
        const slide = !!s.sliding;

        player.scale.set(sizeScale, sizeScale * (slide ? 0.76 : 1), sizeScale);
        rig.torso.rotation.z = slide ? -0.55 : (airborne ? -0.17 : -0.10);
        rig.head.rotation.z = slide ? 0.16 : (airborne ? 0.08 : 0);

        rig.leftLeg.upper.rotation.z = slide ? 0.96 : (airborne ? 0.52 : swing);
        rig.rightLeg.upper.rotation.z = slide ? -0.44 : (airborne ? -0.56 : -swing);
        rig.leftLeg.lower.rotation.z = slide ? -0.22 : (airborne ? -0.85 : Math.max(0, -swing) * 0.7);
        rig.rightLeg.lower.rotation.z = slide ? 0.52 : (airborne ? -0.72 : Math.max(0, swing) * 0.7);

        rig.leftArm.upper.rotation.z = slide ? -1.15 : (airborne ? -0.92 : -swing * 0.82);
        rig.rightArm.upper.rotation.z = slide ? 0.92 : (airborne ? 0.88 : swing * 0.82);
        rig.leftArm.lower.rotation.z = slide ? -0.28 : (airborne ? -0.36 : -0.18 - Math.max(0, swing) * 0.3);
        rig.rightArm.lower.rotation.z = slide ? 0.22 : (airborne ? 0.36 : 0.18 + Math.max(0, -swing) * 0.3);

        // Small vertical body rhythm and impact squash while preserving game physics.
        if (running && !airborne && !slide) {
            player.position.y += Math.abs(Math.sin(phase * 2)) * 0.025 * sizeScale;
        }
        if (s.shake > 0 && !airborne) player.rotation.z = Math.sin(elapsed * 32) * 0.025;
        else player.rotation.z = 0;

        player.userData.shieldRing.visible = !!s.shield;
        player.userData.shieldRing.rotation.z = elapsed * 0.75;

        const flicker = s.invuln > 0 && Math.floor(elapsed * 18) % 2 === 0;
        player.visible = !flicker;
        playerShadow.position.set(x, layout.groundY + 0.02, 2.76);
        const shadowScale = Math.max(0.42, 1 - s.py / 260);
        playerShadow.scale.set(shadowScale * sizeScale, shadowScale * 0.2 * sizeScale, 1);
        playerShadow.material.opacity = 0.24 * shadowScale;
    }

    function updateWorldMotion(s) {
        if (!layout) return;
        // Gentle parallax makes the campus drift while the player stays in its lane.
        environment.position.x = -(((s.scroll || 0) * layout.scale * 0.045) % (layout.worldWidth * 0.42));
        const offset = ((s.scroll || 0) * layout.scale * 0.42) % (layout.worldWidth * 0.3);
        groundMarkers.forEach((marker, i) => {
            const base = marker.userData.baseX;
            if (base == null) marker.userData.baseX = marker.position.x;
            marker.position.x = ((marker.userData.baseX - offset + layout.worldWidth * 1.5) % (layout.worldWidth * 3)) - layout.worldWidth * 1.5;
        });
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