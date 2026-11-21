import * as THREE from 'three';

/*
 * Escape the Interview · 3D visual layer
 * First migration pass: 3D environment, temporary human character,
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
        console.warn(
            '[Escape the Interview] WebGL unavailable. Keeping the 2D renderer.',
            error
        );
        return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xc9b9b3);
    scene.fog = new THREE.Fog(0xc9b9b3, 27, 68);

    const camera = new THREE.OrthographicCamera(
        -10, 10, 5, -5, 0.1, 120
    );
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

    const mat = (color, roughness = 0.7, metalness = 0) =>
        new THREE.MeshStandardMaterial({
            color,
            roughness,
            metalness
        });

    function makeCanvasTexture(draw, width = 1024, height = 512) {
        const c = document.createElement('canvas');
        c.width = width;
        c.height = height;

        const g = c.getContext('2d');
        draw(g, width, height);

        const texture = new THREE.CanvasTexture(c);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(
            renderer.capabilities.getMaxAnisotropy(),
            8
        );

        return texture;
    }

    function glassTexture() {
        return makeCanvasTexture((g, w, h) => {
            const gradient = g.createLinearGradient(0, 0, w, h);

            gradient.addColorStop(0, '#182b38');
            gradient.addColorStop(0.48, '#314b59');
            gradient.addColorStop(1, '#172b39');

            g.fillStyle = gradient;
            g.fillRect(0, 0, w, h);

            const cols = 23;
            const rows = 8;
            const cw = w / cols;
            const rh = h / rows;

            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < cols; x++) {
                    const seed = Math.abs(
                        Math.sin((x + 1) * 17.13 + (y + 2) * 9.71)
                    );

                    const inset = 5;
                    const warm = seed > 0.49;

                    g.fillStyle = warm
                        ? `rgba(255, ${174 + Math.floor(seed * 45)}, ${112 + Math.floor(seed * 55)}, ${0.24 + seed * 0.35})`
                        : `rgba(125, 183, 204, ${0.12 + seed * 0.19})`;

                    g.fillRect(
                        x * cw + inset,
                        y * rh + inset,
                        cw - inset * 2,
                        rh - inset * 2
                    );

                    g.fillStyle = 'rgba(255,255,255,0.07)';
                    g.fillRect(
                        x * cw + inset,
                        y * rh + inset,
                        2,
                        rh - inset * 2
                    );
                }
            }

            g.strokeStyle = 'rgba(8,19,28,0.78)';
            g.lineWidth = 8;

            for (let x = 0; x <= cols; x++) {
                g.beginPath();
                g.moveTo(x * cw, 0);
                g.lineTo(x * cw, h);
                g.stroke();
            }

            for (let y = 0; y <= rows; y++) {
                g.beginPath();
                g.moveTo(0, y * rh);
                g.lineTo(w, y * rh);
                g.stroke();
            }

            const glow = g.createRadialGradient(
                w * 0.72, h * 0.42, 5,
                w * 0.72, h * 0.42, h * 0.38
            );

            glow.addColorStop(0, 'rgba(255,196,132,0.18)');
            glow.addColorStop(1, 'rgba(255,196,132,0)');

            g.fillStyle = glow;
            g.fillRect(0, 0, w, h);
        });
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

                g.fillRect(
                    x,
                    y,
                    Math.random() * 3 + 0.5,
                    Math.random() * 2 + 0.5
                );
            }

            g.strokeStyle = 'rgba(35,42,48,0.22)';
            g.lineWidth = 2;

            for (let y = 64; y < h; y += 128) {
                g.beginPath();
                g.moveTo(0, y);
                g.lineTo(w, y + 2);
                g.stroke();
            }
        }, 1024, 512);
    }

    function labelTexture(
        label,
        bg = '#e8dfd2',
        fg = '#222a31'
    ) {
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

                g.fillText(
                    words.slice(0, Math.ceil(words.length / 2)).join(' '),
                    w / 2,
                    h * 0.43
                );

                g.fillText(
                    words.slice(Math.ceil(words.length / 2)).join(' '),
                    w / 2,
                    h * 0.63
                );
            } else {
                g.fillText(
                    String(label || 'RESUME').slice(0, 22),
                    w / 2,
                    h * 0.53
                );
            }
        }, 512, 256);
    }

    function mesh(geometry, material, parent, position) {
        const object = new THREE.Mesh(geometry, material);

        if (position) {
            object.position.set(
                position.x || 0,
                position.y || 0,
                position.z || 0
            );
        }

        object.castShadow = true;
        object.receiveShadow = true;
        parent.add(object);

        return object;
    }

    function addBox(parent, width, height, depth, material, x, y, z) {
        return mesh(
            new THREE.BoxGeometry(width, height, depth),
            material,
            parent,
            { x, y, z }
        );
    }

    function disposeTree(object) {
        object.traverse(child => {
            if (child.geometry) {
                child.geometry.dispose();
            }

            if (child.material) {
                const materials = Array.isArray(child.material)
                    ? child.material
                    : [child.material];

                materials.forEach(material => {
                    for (const value of Object.values(material)) {
                        if (value && value.isTexture) {
                            value.dispose();
                        }
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

        const leaves = [
            mat('#263e35', 0.92),
            mat('#365244', 0.9),
            mat('#536b50', 0.92)
        ];

        const group = new THREE.Group();
        group.position.set(x, baseY, z);
        parent.add(group);

        mesh(
            new THREE.CylinderGeometry(
                0.11 * s,
                0.18 * s,
                2.1 * s,
                7
            ),
            trunk,
            group,
            { x: 0, y: 1.05 * s, z: 0 }
        );

        const clusters = [
            [-0.45, 2.55, 0.0, 0.92],
            [0.38, 2.7, 0.08, 1.05],
            [0, 3.35, -0.08, 1.1],
            [-0.12, 2.2, 0.18, 0.8]
        ];

        clusters.forEach((p, i) => {
            const foliage = mesh(
                new THREE.IcosahedronGeometry(p[3] * s, 2),
                leaves[i % leaves.length],
                group,
                {
                    x: p[0] * s,
                    y: p[1] * s,
                    z: p[2]
                }
            );

            foliage.scale.set(1.05, 0.9, 0.82);
        });
    }

    function addOfficeBuilding(
        parent,
        x,
        baseY,
        width,
        height,
        z,
        tint = '#203746'
    ) {
        const group = new THREE.Group();
        group.position.set(x, baseY, z);
        parent.add(group);

        const bodyMat = new THREE.MeshStandardMaterial({
            map: glassTexture(),
            color: tint,
            roughness: 0.28,
            metalness: 0.46
        });

        addBox(
            group,
            width,
            height,
            1.2,
            bodyMat,
            0,
            height / 2,
            0
        );

        const sideMat = mat('#172a36', 0.32, 0.45);

        addBox(
            group, 0.24, height + 0.3, 1.34,
            sideMat, -width / 2, height / 2, 0.04
        );

        addBox(
            group, 0.24, height + 0.3, 1.34,
            sideMat, width / 2, height / 2, 0.04
        );

        addBox(
            group, width + 0.2, 0.18, 1.38,
            mat('#111e28', 0.36, 0.5),
            0, height, 0.05
        );

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

        const scale = 10 / s.LH;
        const worldWidth = s.LW * scale;
        const groundY = (s.LH / 2 - s.GY) * scale;

        layout = {
            scale,
            worldWidth,
            groundY,
            LW: s.LW,
            LH: s.LH,
            GY: s.GY
        };

        camera.left = -worldWidth / 2;
        camera.right = worldWidth / 2;
        camera.top = 5;
        camera.bottom = -5;
        camera.updateProjectionMatrix();

        scene.background = new THREE.Color(0xf1c4a7);
        scene.fog = new THREE.Fog(0xb7aaa4, 30, 68);

        ambientLight = new THREE.HemisphereLight(
            0xdcecff,
            0x51453f,
            1.65
        );
        environment.add(ambientLight);

        keyLight = new THREE.DirectionalLight(0xffd1a1, 3.2);
        keyLight.position.set(-7, 10, 14);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.set(1024, 1024);
        keyLight.shadow.camera.left = -25;
        keyLight.shadow.camera.right = 25;
        keyLight.shadow.camera.top = 18;
        keyLight.shadow.camera.bottom = -18;
        keyLight.shadow.bias = -0.0003;

        environment.add(keyLight);

        // Sunset sky backdrop.
        const skyTexture = makeCanvasTexture((g, w, h) => {
            const grad = g.createLinearGradient(0, 0, 0, h);

            grad.addColorStop(0, '#5d7183');
            grad.addColorStop(0.42, '#9ca5aa');
            grad.addColorStop(0.73, '#e3a786');
            grad.addColorStop(1, '#f6c99f');

            g.fillStyle = grad;
            g.fillRect(0, 0, w, h);

            const sun = g.createRadialGradient(
                w * 0.78,
                h * 0.55,
                10,
                w * 0.78,
                h * 0.55,
                h * 0.42
            );

            sun.addColorStop(0, 'rgba(255,228,179,0.84)');
            sun.addColorStop(0.25, 'rgba(255,204,158,0.28)');
            sun.addColorStop(1, 'rgba(255,204,158,0)');

            g.fillStyle = sun;
            g.fillRect(0, 0, w, h);
        }, 1024, 512);

        const sky = mesh(
            new THREE.PlaneGeometry(worldWidth * 3.5, 26),
            new THREE.MeshBasicMaterial({
                map: skyTexture,
                depthWrite: false
            }),
            environment,
            { x: 0, y: 1.1, z: -28 }
        );

        sky.renderOrder = -5;

        // Main glass campus building and distant towers.
        addOfficeBuilding(
            environment, 0, groundY - 0.1,
            worldWidth * 1.65, 15.5, -17, '#29404e'
        );

        addOfficeBuilding(
            environment, -worldWidth * 0.62, groundY + 0.2,
            worldWidth * 0.54, 11.2, -22, '#263a47'
        );

        addOfficeBuilding(
            environment, worldWidth * 0.72, groundY + 0.1,
            worldWidth * 0.5, 12.6, -21, '#3a4650'
        );

        // Corporate sign.
        const sign = new THREE.Group();
        sign.position.set(
            -worldWidth * 0.34,
            groundY + 7.9,
            -15.8
        );
        environment.add(sign);

        addBox(
            sign, 3.1, 0.84, 0.12,
            mat('#101d27', 0.38, 0.3),
            0, 0, 0
        );

        const signTex = makeCanvasTexture((g, w, h) => {
            g.fillStyle = '#101d27';
            g.fillRect(0, 0, w, h);

            g.fillStyle = '#e9f2f4';
            g.font = '700 62px Arial';
            g.textAlign = 'center';
            g.textBaseline = 'middle';

            g.fillText('TECHCORP', w / 2, h / 2);
        }, 512, 128);

        mesh(
            new THREE.PlaneGeometry(3.05, 0.78),
            new THREE.MeshBasicMaterial({ map: signTex }),
            sign,
            { x: 0, y: 0, z: 0.08 }
        );

        // Foreground planters and landscaping.
        const planterMat = mat('#505e5b', 0.82, 0.08);
        const soilMat = mat('#443e34', 1);
        const shrubMat = mat('#385044', 0.96);

        for (let i = -2; i <= 2; i++) {
            const x = i * worldWidth * 0.42 + worldWidth * 0.1;

            addBox(
                environment, 2.1, 0.62, 1.2,
                planterMat, x, groundY + 0.34, -4.0
            );

            addBox(
                environment, 1.9, 0.12, 1.05,
                soilMat, x, groundY + 0.7, -3.92
            );

            for (let k = 0; k < 4; k++) {
                const shrub = mesh(
                    new THREE.IcosahedronGeometry(
                        0.38 + (k % 2) * 0.08,
                        1
                    ),
                    shrubMat,
                    environment,
                    {
                        x: x - 0.67 + k * 0.43,
                        y: groundY + 1.0 + (k % 2) * 0.08,
                        z: -3.75
                    }
                );

                shrub.scale.set(1.25, 0.82, 0.85);
            }
        }

        addTree(environment, -worldWidth * 0.46, groundY + 0.5, -5.5, 1.15);
        addTree(environment, worldWidth * 0.46, groundY + 0.5, -5.8, 1.0);
        addTree(environment, worldWidth * 0.9, groundY + 0.5, -6.2, 0.9);

        // Lamp posts.
        for (let i = -1; i <= 2; i++) {
            const x = i * worldWidth * 0.62 + worldWidth * 0.18;

            addBox(
                environment, 0.09, 4.0, 0.1,
                mat('#303a40', 0.35, 0.72),
                x, groundY + 2.0, -1.8
            );

            addBox(
                environment, 0.65, 0.09, 0.16,
                mat('#303a40', 0.35, 0.72),
                x + 0.28, groundY + 4.0, -1.8
            );

            const lamp = mesh(
                new THREE.BoxGeometry(0.35, 0.13, 0.25),
                new THREE.MeshStandardMaterial({
                    color: '#ffe5b8',
                    emissive: '#ffc477',
                    emissiveIntensity: 2.2
                }),
                environment,
                {
                    x: x + 0.48,
                    y: groundY + 3.91,
                    z: -1.67
                }
            );

            lamp.castShadow = false;
        }

        // Street and road.
        const bottomY = -5.4;
        const roadHeight = Math.max(0.4, groundY - bottomY);
        const concrete = concreteTexture();

        const roadMat = new THREE.MeshStandardMaterial({
            map: concrete,
            roughness: 0.32,
            metalness: 0.12
        });

        addBox(
            environment,
            worldWidth * 2.8,
            roadHeight,
            2.1,
            roadMat,
            0,
            (groundY + bottomY) / 2,
            1.7
        );

        // Pale curb / footpath.
        addBox(
            environment,
            worldWidth * 2.8,
            0.32,
            2.4,
            mat('#9d9a96', 0.68),
            0,
            groundY - 0.17,
            1.05
        );

        addBox(
            environment,
            worldWidth * 2.8,
            0.045,
            2.44,
            mat('#d9d2ca', 0.43),
            0,
            groundY - 0.015,
            0.98
        );

        // Wet asphalt reflections.
        const wetStreakMat = new THREE.MeshBasicMaterial({
            color: 0xe5bda0,
            transparent: true,
            opacity: 0.13
        });

        for (let i = 0; i < 22; i++) {
            const x = -worldWidth * 1.3 + i * worldWidth * 0.13;
            const y = bottomY + 0.34 + (i % 4) * 0.18;

            const streak = addBox(
                environment,
                0.6 + (i % 5) * 0.27,
                0.025,
                0.012,
                wetStreakMat,
                x,
                y,
                2.82
            );

            streak.rotation.z = i % 2 ? 0.018 : -0.014;
        }

        // Pavement lines and road markings.
        const tileLineMat = new THREE.MeshBasicMaterial({
            color: 0xd4cbc2,
            transparent: true,
            opacity: 0.35
        });

        for (let i = 0; i < 15; i++) {
            const line = addBox(
                environment,
                0.018,
                0.42,
                0.015,
                tileLineMat,
                -worldWidth + i * worldWidth * 0.15,
                groundY - 0.41,
                2.87
            );

            groundMarkers.push(line);
        }

        const dashMat = new THREE.MeshBasicMaterial({
            color: 0xd8c2b2,
            transparent: true,
            opacity: 0.22
        });

        for (let i = 0; i < 8; i++) {
            const dash = addBox(
                environment,
                1.1,
                0.035,
                0.02,
                dashMat,
                -worldWidth + i * worldWidth * 0.31,
                bottomY + 1.1,
                2.9
            );

            groundMarkers.push(dash);
        }

        createPlayer();
    }

    function createLimb(parent, length, radius, material, x, y, z) {
        const pivot = new THREE.Group();
        pivot.position.set(x, y, z);
        parent.add(pivot);

        mesh(
            new THREE.CapsuleGeometry(radius, length, 4, 8),
            material,
            pivot,
            { x: 0, y: -length * 0.48, z: 0 }
        );

        return pivot;
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

        const skin = mat('#b77c5b', 0.82);
        const shirt = mat('#e9e8e2', 0.94);
        const shirtShade = mat('#b6b8b5', 0.88);
        const pants = mat('#202a34', 0.9);
        const shoes = mat('#202329', 0.76, 0.08);
        const hair = mat('#17191d', 0.95);
        const backpack = mat('#282e34', 0.92);
        const sole = mat('#c5c1b8', 0.84);

        // Backpack.
        addBox(
            group, 0.54, 0.78, 0.35,
            backpack, -0.39, 1.38, -0.22
        );

        addBox(
            group, 0.42, 0.12, 0.38,
            mat('#42494f', 0.88),
            -0.39, 1.04, -0.18
        );

        // Torso and hips.
        mesh(
            new THREE.CapsuleGeometry(0.31, 0.7, 5, 10),
            shirt,
            group,
            { x: 0, y: 1.48, z: 0 }
        );

        addBox(
            group, 0.52, 0.18, 0.34,
            shirtShade, 0.02, 1.56, 0.015
        );

        mesh(
            new THREE.CapsuleGeometry(0.25, 0.3, 4, 8),
            pants,
            group,
            { x: 0, y: 0.92, z: 0 }
        );

        // Head, neck and hair.
        mesh(
            new THREE.CylinderGeometry(0.095, 0.11, 0.2, 10),
            skin,
            group,
            { x: 0.02, y: 1.94, z: 0 }
        );

        mesh(
            new THREE.SphereGeometry(0.255, 18, 14),
            skin,
            group,
            { x: 0.08, y: 2.19, z: 0.015 }
        );

        const hairCap = mesh(
            new THREE.SphereGeometry(
                0.262, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.57
            ),
            hair,
            group,
            { x: 0.055, y: 2.29, z: -0.01 }
        );

        hairCap.scale.set(1.05, 0.8, 1.05);

        mesh(
            new THREE.BoxGeometry(0.12, 0.13, 0.3),
            hair,
            group,
            { x: -0.145, y: 2.2, z: -0.005 }
        );

        // Side-facing face details.
        mesh(
            new THREE.SphereGeometry(0.052, 10, 8),
            skin,
            group,
            { x: 0.31, y: 2.14, z: 0.02 }
        );

        mesh(
            new THREE.SphereGeometry(0.06, 10, 8),
            skin,
            group,
            { x: -0.14, y: 2.16, z: 0.09 }
        );

        const leftLeg = createLimb(
            group, 0.66, 0.115, pants,
            -0.13, 0.83, 0.10
        );

        const rightLeg = createLimb(
            group, 0.66, 0.115, pants,
            0.13, 0.83, -0.09
        );

        const leftArm = createLimb(
            group, 0.56, 0.09, shirt,
            -0.23, 1.72, 0.14
        );

        const rightArm = createLimb(
            group, 0.56, 0.09, shirt,
            0.23, 1.72, -0.10
        );

        function addShoe(x, z) {
            addBox(
                group, 0.42, 0.16, 0.25,
                shoes, x, 0.1, z
            );

            addBox(
                group, 0.43, 0.045, 0.255,
                sole, x + 0.015, 0.025, z + 0.004
            );
        }

        addShoe(0, 0.1);
        addShoe(0, -0.09);

        group.userData.rig = {
            leftLeg,
            rightLeg,
            leftArm,
            rightArm
        };

        const shieldRing = mesh(
            new THREE.TorusGeometry(0.9, 0.045, 10, 48),
            new THREE.MeshStandardMaterial({
                color: '#a9d9f4',
                emissive: '#6bb9e8',
                emissiveIntensity: 0.7,
                transparent: true,
                opacity: 0.68,
                roughness: 0.28,
                metalness: 0.25
            }),
            group,
            { x: 0, y: 1.1, z: 0.25 }
        );

        shieldRing.rotation.y = Math.PI / 2;
        group.userData.shieldRing = shieldRing;

        playerShadow = mesh(
            new THREE.CircleGeometry(0.62, 32),
            new THREE.MeshBasicMaterial({
                color: '#15191e',
                transparent: true,
                opacity: 0.23,
                depthWrite: false
            }),
            characterLayer,
            { x: 0, y: layout.groundY + 0.015, z: 2.75 }
        );

        playerShadow.scale.set(1, 0.2, 1);
    }

    function createObstacle(o) {
        const group = new THREE.Group();

        const scale = layout.scale;
        const groundY = layout.groundY;

        const cardboard = mat('#a97548', 0.96);
        const cardboardSide = mat('#825535', 0.97);
        const metal = mat('#333d44', 0.45, 0.72);
        const hazard = mat('#d7a33e', 0.82);

        if (o.type === 'crate') {
            const w = Math.max(0.9, o.w * scale);
            const h = Math.max(0.8, o.h * scale);

            addBox(
                group, w, h, 0.9,
                cardboard, 0, h / 2, 0
            );

            addBox(
                group, w * 0.98, 0.08, 0.93,
                cardboardSide, 0, h * 0.5, 0.02
            );

            addBox(
                group, 0.12, h * 0.98, 0.94,
                hazard, 0, h / 2, 0.48
            );

            const sticker = mesh(
                new THREE.PlaneGeometry(
                    Math.max(0.54, w * 0.72),
                    Math.max(0.24, h * 0.34)
                ),
                new THREE.MeshBasicMaterial({
                    map: labelTexture(
                        o.label || 'CV.PDF',
                        '#e9e4dc',
                        '#30343a'
                    )
                }),
                group,
                {
                    x: 0,
                    y: h * 0.58,
                    z: 0.49
                }
            );

            sticker.renderOrder = 2;

            group.position.set(
                (o.x + o.w / 2 - layout.LW / 2) * scale,
                groundY,
                1.25
            );

        } else if (o.type === 'flag') {
            const poleH = 4.8;

            addBox(
                group, 0.12, poleH, 0.14,
                metal, 0, poleH / 2, 0
            );

            addBox(
                group, 1.25, 0.12, 0.18,
                metal, 0, poleH, 0
            );

            const signW = Math.max(1.8, o.w * scale * 1.25);

            const sign = addBox(
                group, signW, 2.5, 0.22,
                mat('#723c34', 0.68),
                0, poleH - 1.5, 0.1
            );

            const face = mesh(
                new THREE.PlaneGeometry(signW - 0.16, 2.32),
                new THREE.MeshBasicMaterial({
                    map: labelTexture(
                        o.label || 'REJECT',
                        '#e8d4c3',
                        '#322a28'
                    )
                }),
                group,
                {
                    x: 0,
                    y: poleH - 1.5,
                    z: 0.23
                }
            );

            face.renderOrder = 2;

            group.position.set(
                (o.x + o.w / 2 - layout.LW / 2) * scale,
                groundY - 0.5,
                1.35
            );

            group.userData.sign = sign;

        } else if (o.type === 'drone') {
            const body = mesh(
                new THREE.BoxGeometry(1.25, 0.38, 0.55),
                metal,
                group,
                { x: 0, y: 0, z: 0 }
            );

            const badge = mesh(
                new THREE.BoxGeometry(0.54, 0.23, 0.08),
                mat('#d94f54', 0.55),
                group,
                { x: 0, y: -0.38, z: 0.1 }
            );

            for (const dx of [-0.67, 0.67]) {
                const rotor = mesh(
                    new THREE.CylinderGeometry(0.28, 0.28, 0.04, 20),
                    metal,
                    group,
                    { x: dx, y: 0.15, z: 0 }
                );

                rotor.rotation.x = Math.PI / 2;
            }

            group.position.set(
                (o.x + o.w / 2 - layout.LW / 2) * scale,
                (layout.GY - o.y) * scale + groundY,
                1.5
            );

            group.userData.body = body;
            group.userData.badge = badge;

        } else {
            const ball = mesh(
                new THREE.SphereGeometry(0.62, 24, 18),
                mat('#aa5544', 0.55),
                group,
                { x: 0, y: 0.62, z: 0 }
            );

            ball.scale.set(1.1, 0.9, 0.9);

            group.position.set(
                (o.x + o.w / 2 - layout.LW / 2) * scale,
                groundY,
                1.4
            );

            group.userData.ball = ball;
        }

        return group;
    }

    function createCoin(item) {
        const group = new THREE.Group();

        const gold = new THREE.MeshStandardMaterial({
            color: '#ffc83d',
            metalness: 0.72,
            roughness: 0.24,
            emissive: '#8e5b09',
            emissiveIntensity: 0.25
        });

        const rim = mat('#c8871c', 0.26, 0.82);

        mesh(
            new THREE.CylinderGeometry(0.29, 0.29, 0.095, 32),
            rim,
            group
        ).rotation.x = Math.PI / 2;

        const face = mesh(
            new THREE.CircleGeometry(0.245, 32),
            gold,
            group,
            { x: 0, y: 0, z: 0.055 }
        );

        const glyph = mesh(
            new THREE.TorusGeometry(0.14, 0.025, 6, 24),
            mat('#fff0b1', 0.28, 0.45),
            group,
            { x: 0, y: 0, z: 0.07 }
        );

        group.userData.face = face;
        group.userData.glyph = glyph;

        group.position.set(
            (item.x - layout.LW / 2) * layout.scale,
            layout.groundY + item.h * layout.scale,
            2.0
        );

        return group;
    }

    function createPower(item) {
        const group = new THREE.Group();

        const isShield = item.kind === 'shield';
        const color = isShield ? '#86c9ec' : '#db9b5c';

        const core = mesh(
            new THREE.OctahedronGeometry(0.4, 1),
            new THREE.MeshStandardMaterial({
                color,
                metalness: 0.5,
                roughness: 0.22,
                emissive: color,
                emissiveIntensity: 0.5
            }),
            group
        );

        const ring = mesh(
            new THREE.TorusGeometry(0.55, 0.035, 8, 32),
            mat('#f5dfbd', 0.35, 0.45),
            group
        );

        ring.rotation.x = Math.PI / 2;

        group.position.set(
            (item.x - layout.LW / 2) * layout.scale,
            layout.groundY + item.h * layout.scale,
            2.0
        );

        group.userData.core = core;

        return group;
    }

    function createDoor(door) {
        const group = new THREE.Group();
        const metal = mat('#293841', 0.32, 0.72);

        addBox(
            group, 0.18, 4.9, 0.22,
            metal, -1.15, 2.45, 0
        );

        addBox(
            group, 0.18, 4.9, 0.22,
            metal, 1.15, 2.45, 0
        );

        addBox(
            group, 2.4, 0.18, 0.22,
            metal, 0, 4.9, 0
        );

        const glow = new THREE.MeshStandardMaterial({
            color: '#f5c985',
            emissive: '#ed9551',
            emissiveIntensity: 1.4,
            roughness: 0.32
        });

        addBox(
            group, 1.95, 3.9, 0.06,
            glow, 0, 2.0, -0.12
        );

        const plaque = mesh(
            new THREE.PlaneGeometry(1.7, 0.55),
            new THREE.MeshBasicMaterial({
                map: labelTexture(
                    door.label || 'OFFER',
                    '#f1dfc8',
                    '#312d2a'
                )
            }),
            group,
            { x: 0, y: 4.25, z: 0.16 }
        );

        plaque.renderOrder = 2;

        group.position.set(
            (door.x + door.w / 2 - layout.LW / 2) * layout.scale,
            layout.groundY,
            1.45
        );

        return group;
    }

    function syncMap(map, items, create, update) {
        const active = new Set(items);

        for (const [key, object] of map) {
            if (!active.has(key)) {
                worldItems.remove(object);
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

        const sizeScale = scale / (10 / 338);
        const rig = player.userData.rig;

        const running =
            s.state === 'playing' ||
            s.state === 'countdown' ||
            s.state === 'menu';

        const phase = s.runPhase || elapsed * 7;
        const swing = running ? Math.sin(phase) * 0.68 : 0;

        const airborne = s.py > 1 || s.vy > 0;
        const slide = !!s.sliding;

        player.rotation.z = slide
            ? -0.22
            : (airborne ? -0.08 : 0);

        player.scale.set(
            sizeScale,
            sizeScale * (slide ? 0.66 : 1),
            sizeScale
        );

        rig.leftLeg.rotation.z = slide
            ? 0.95
            : (airborne ? 0.35 : swing);

        rig.rightLeg.rotation.z = slide
            ? -0.35
            : (airborne ? -0.3 : -swing);

        rig.leftArm.rotation.z = slide
            ? -1.0
            : (airborne ? -0.8 : -swing * 0.85);

        rig.rightArm.rotation.z = slide
            ? 0.8
            : (airborne ? 0.9 : swing * 0.85);

        player.userData.shieldRing.visible = !!s.shield;
        player.userData.shieldRing.rotation.z = elapsed * 0.75;

        const flicker =
            s.invuln > 0 &&
            Math.floor(elapsed * 18) % 2 === 0;

        player.visible = !flicker;

        playerShadow.position.set(
            x,
            layout.groundY + 0.02,
            2.76
        );

        const shadowScale = Math.max(0.48, 1 - s.py / 260);

        playerShadow.scale.set(
            shadowScale * sizeScale,
            shadowScale * 0.2 * sizeScale,
            1
        );

        playerShadow.material.opacity = 0.23 * shadowScale;
    }

    function updateWorldMotion(s) {
        if (!layout) return;

        environment.position.x =
            -(((s.scroll || 0) * layout.scale * 0.045) %
                (layout.worldWidth * 0.42));

        const offset =
            ((s.scroll || 0) * layout.scale * 0.42) %
            (layout.worldWidth * 0.3);

        groundMarkers.forEach(marker => {
            const base = marker.userData.baseX;

            if (base == null) {
                marker.userData.baseX = marker.position.x;
            }

            marker.position.x =
                ((marker.userData.baseX - offset +
                    layout.worldWidth * 1.5) %
                    (layout.worldWidth * 3)) -
                layout.worldWidth * 1.5;
        });
    }

    function capture() {
        const webglCanvas = renderer.domElement;
        const hudCanvas = document.getElementById('mazeCanvas');

        const output = document.createElement('canvas');
        output.width = webglCanvas.width;
        output.height = webglCanvas.height;

        const context = output.getContext('2d');

        context.drawImage(
            webglCanvas,
            0,
            0,
            output.width,
            output.height
        );

        if (hudCanvas) {
            context.drawImage(
                hudCanvas,
                0,
                0,
                output.width,
                output.height
            );
        }

        return output;
    }

    function render(s) {
        if (
            !s ||
            !Number.isFinite(s.LW) ||
            !Number.isFinite(s.LH)
        ) {
            return;
        }

        const key = `${s.LW}|${s.LH}|${s.GY}`;

        if (key !== currentLayout) {
            currentLayout = key;
            buildEnvironment(s);
        }

        const elapsed = clock.getElapsedTime();

        updatePlayer(s, elapsed);
        updateWorldMotion(s);

        syncMap(
            obstacleMeshes,
            (s.obstacles || []).filter(o => !o.dead),
            createObstacle,
            (object, item) => {
                const scale = layout.scale;

                const x =
                    (item.x + item.w / 2 - layout.LW / 2) * scale;

                if (item.type === 'crate') {
                    object.position.x = x;
                } else if (item.type === 'flag') {
                    object.position.x = x;
                } else if (item.type === 'drone') {
                    object.position.x = x;

                    object.position.y =
                        layout.groundY +
                        (layout.GY - item.y -
                            Math.sin(item.t * 3) * 6) * scale;
                } else {
                    object.position.x = x;
                }

                object.visible =
                    !item.hit ||
                    Math.floor(elapsed * 16) % 2 === 0;

                if (
                    item.type === 'ball' &&
                    object.userData.ball
                ) {
                    object.userData.ball.rotation.z =
                        item.rot || elapsed * 2;
                }
            }
        );

        syncMap(
            coinMeshes,
            s.coinItems || [],
            createCoin,
            (object, item) => {
                object.position.x =
                    (item.x - layout.LW / 2) * layout.scale;

                object.position.y =
                    layout.groundY + item.h * layout.scale;

                object.rotation.y =
                    Math.sin((item.spin || 0) + elapsed * 3) * 0.85;

                object.rotation.z =
                    Math.sin((item.spin || 0) + elapsed * 2) * 0.08;
            }
        );

        syncMap(
            powerMeshes,
            s.powerItems || [],
            createPower,
            (object, item) => {
                object.position.x =
                    (item.x - layout.LW / 2) * layout.scale;

                object.position.y =
                    layout.groundY +
                    item.h * layout.scale +
                    Math.sin(elapsed * 2.5 + (item.t || 0)) * 0.08;

                object.rotation.y = elapsed * 0.9;
                object.rotation.z = elapsed * 0.45;
            }
        );

        syncMap(
            doorMeshes,
            s.doors || [],
            createDoor,
            (object, item) => {
                object.position.x =
                    (item.x + item.w / 2 - layout.LW / 2) *
                    layout.scale;
            }
        );

        // Camera shake from existing gameplay feedback.
        camera.position.x = s.shake > 0
            ? Math.sin(elapsed * 43) *
                Math.min(0.09, s.shake * 0.004)
            : 0;

        camera.position.y = s.shake > 0
            ? Math.cos(elapsed * 37) *
                Math.min(0.06, s.shake * 0.003)
            : 0;

        renderer.render(scene, camera);
    }

    function resize() {
        const width = Math.max(1, wrap.clientWidth);
        const height = Math.max(1, wrap.clientHeight);

        renderer.setSize(width, height, false);
        renderer.setPixelRatio(
            Math.min(window.devicePixelRatio || 1, 1.5)
        );
    }

    if (typeof ResizeObserver === 'function') {
        new ResizeObserver(resize).observe(wrap);
    } else {
        window.addEventListener('resize', resize);
    }

    resize();

    wrap.classList.add('has-3d');

    window.EscapeInterview3D = {
        render,
        capture
    };

    console.info('[Escape the Interview] 3D renderer ready.');
})();