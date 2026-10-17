/**
 * Projects Data
 * Add, remove, or edit projects here. The renderer and filters update automatically.
 *
 * image: path to a thumbnail in your public/root assets, e.g. '/src/images/projects/rasoi-bazaar.webp'
 * video: OPTIONAL. Path to a short demo clip, e.g. '/src/images/projects/rasoi-bazaar-demo.mp4'.
 *   Leave unset (or '') and the project just shows the static thumbnail, same as always —
 *   nothing else to configure. When set, the row automatically gets:
 *     - a muted hover preview on desktop (plays once from the start, reverts to the
 *       thumbnail if the cursor leaves or the clip ends)
 *     - a click/tap-to-play real player (unmuted, native controls) on desktop and mobile
 *   Keep clips short (a few seconds) and silent-friendly — they play muted by default.
 *   Any standard web video format works; .mp4 (H.264) has the widest browser support.
 * tech_categories: combined list of category tags (must match FILTER_CATEGORIES in
 *   projects-renderer.js: iOS, React Native, Deep Learning, React, Backend, DSA) and tech stack.
 *   List each item once — no need to repeat a category that's also a technology.
 * github and demo are optional. Leave them as empty strings to hide their buttons.
 */
window.projects = [
    {
        id: 'digital-twin',
        title: 'Digital Twin',
        description: 'A full-stack AI chat assistant simulating my personal knowledge and communication style - remembers past conversations, shares links with previews, reacts to messages with emojis, and sends photos and voice notes.',
        image: '/src/images/projects/digital_twin.png',
        imageAlt: 'Digital Twin chat interface',
        video: '/src/images/projects/digitaltwin-demo.mp4',
        spriteSheet: "src/images/projects/digitaltwin-sprite.jpg",
        spriteInterval: 2,
        spriteCols: 8,
        spriteRows: 7,
        spriteFrameWidth: 160,
        spriteFrameHeight: 90,
        tech_categories: ['React', 'Backend', 'Node.js', 'NLP', 'RAG'],
        github: '',
        demo: 'https://pranavkohli24.github.io/#twin'
    },
    {
        id: 'rasoi-bazaar',
        title: 'Rasoi Bazaar',
        description: 'An Indian cuisine recipe generator with 500+ dishes, attracting and retaining 10,000+ users. Features text + image search, a "cook what you have" mode, Swiggy/Instamart ordering via MCP, and an AI cooking companion that answers context-aware questions about the dish you\'re making.',
        image: '/src/images/projects/rasoi-bazaar.png',
        imageAlt: 'Rasoi Bazaar recipe discovery interface',
        // video: '/src/images/projects/rasoi-demo.mp4',
        tech_categories: ['React', 'Backend', 'Node.js', 'Elastic Search', 'NLP', 'RAG'],
        github: '',
        demo: 'http://rasoi-bazaar.vercel.app/'
    },
    {
        id: 'digital-locket',
        title: 'Locket',
        description: 'Apple Swift Student Challenge 2026 winning project - a SwiftUI locket preserving 7 life memories, with procedural particle effects and Core Haptics for an interactive feel.',
        image: '/src/images/projects/Locket.png',
        imageAlt: 'Locket iOS app interface',
        tech_categories: ['iOS', 'Swift', 'SwiftUI', 'Core Haptics', 'MVVM'],
        github: 'https://github.com/PranavKohli24/Digital_Locket',
        demo: ''
    },
    {
        id: 'movie-nest',
        title: 'Movie Nest',
        description: 'A complete movie listing app built with UIKit - AutoLayout, collection views, nav controllers, Combine, and unit tests - integrated with the Studio Ghibli API, using MVVM architecture.',
        image: '/src/images/projects/movie-nest.webp',
        imageAlt: 'Movie Nest app interface',
        tech_categories: ['iOS', 'Swift', 'UIKit', 'MVVM', 'Combine'],
        github: 'https://github.com/PranavKohli24/Movie-App',
        demo: ''
    },
    {
        id: 'market-connect',
        title: 'MarketConnect',
        description: 'A marketplace web app connecting users with local shopkeepers for live product listings and price updates. Includes a price comparison feature across 10+ retailers and a pre-order/quick-pickup system that cut average wait time by 70% (15 to 5 minutes) during testing.',
        image: '/src/images/projects/market-connect.png',
        imageAlt: 'MarketConnect interface',
        tech_categories: ['React', 'Backend', 'Node.js', 'Express', 'MongoDB'],
        github: 'https://github.com/PranavKohli24/MarketConnect/tree/new_branch',
        demo: ''
    },
    {
        id: 'post-away',
        title: 'PostAway',
        description: 'A social media backend with secure JWT authentication for signup, login, and logout. Built a comment/like/post system tested with 200+ queries, and documented the full API with Swagger UI for easy exploration and testing.',
        image: '/src/images/projects/postaway.png',
        imageAlt: 'PostAway backend API',
        tech_categories: ['Backend', 'Node.js', 'MongoDB', 'RESTful API'],
        github: 'https://github.com/PranavKohli24/PostAway_Social',
        demo: ''
    },
    {
        id: 'foodly',
        title: 'Foodly',
        description: 'A full-stack food delivery mobile app with 10+ screens including cart, debounced search, and seamless navigation using React Navigation and Expo Router.',
        image: '/src/images/projects/foodly.png',
        imageAlt: 'Foodly app interface',
        tech_categories: ['React Native', 'Redux', 'Zustand', 'Firebase', 'Expo'],
        github: 'https://github.com/PranavKohli24/Foodly',
        demo: ''
    },
    {
        id: 'mocktails',
        title: 'Velvet Pour',
        description: 'A scroll-synced mocktail shop app that enhances engagement through adaptive visual storytelling.',
        image: '/src/images/projects/mocktails.png',
        imageAlt: 'Velvet Pour mocktail shop interface',
        video: '/src/images/projects/velvetpour-demo.mp4',
        spriteSheet: "src/images/projects/velvetpour-sprite.jpg",
        spriteInterval: 2,
        spriteCols: 6,
        spriteRows: 6,
        spriteFrameWidth: 160,
        spriteFrameHeight: 90,
        tech_categories: ['React', 'Redux', 'GSAP'],
        github: 'https://github.com/PranavKohli24/mocktails',
        demo: 'https://sipbypranav.vercel.app/'
    },
    {
        id: 'grateful-moments',
        title: 'Grateful Moments',
        description: 'A gratitude journaling app built with SwiftUI and SwiftData, featuring custom hexagonal UI components and local photo storage.',
        image: '/src/images/projects/grateful-moments.webp',
        imageAlt: 'Grateful Moments journaling app interface',
        tech_categories: ['iOS', 'Swift', 'SwiftUI', 'SwiftData'],
        github: 'https://github.com/PranavKohli24/iOS_GratefulMoments',
        demo: ''
    },
    {
        id: 'chatrify',
        title: 'Chatrify',
        description: 'A real-time chat website with onboarding and encrypted, persistent communication for 100+ users. Integrated the Gemini API for AI message tagging and in-chat AI Q&A for intelligent 1:1 conversations.',
        image: '/src/images/projects/chatrify.png',
        imageAlt: 'Chatrify real-time chat interface',
        video: '/src/images/projects/chatrify-demo.mp4',
        spriteSheet: "src/images/projects/chatrify-sprite.jpg",
        spriteInterval: 2,       // one frame every 2 seconds
        spriteCols: 7,
        spriteRows: 7,
        spriteFrameWidth: 160,
        spriteFrameHeight: 90,
        tech_categories: ['React', 'Backend', 'Next.js', 'Node.js', 'Express', 'MongoDB', 'Socket.io'],
        github: '',
        demo: 'https://youtu.be/aN6EdAvwAhQ'
    },
    {
        id: 'gpt-transformer-architecture',
        title: 'GPT Transformer Architecture',
        description: 'Studied in-depth about the famous Attention Is All You Need" research paper that introduced the Transformer architecture behind ChatGPT. Studied the complete RNN, problems with RNN, LSTM, Attention mechanism, and self attention.',
        image: '/src/images/projects/gpt_arch.png',
        imageAlt: 'GPT Transformer Architecture project',
        video: '/src/images/projects/gptarch-demo.mp4',
        spriteSheet: "src/images/projects/gptarch-sprite.jpg",
        spriteInterval: 2,
        spriteCols: 5,
        spriteRows: 5,
        spriteFrameWidth: 160,
        spriteFrameHeight: 90,
        tech_categories: ['DSA', 'Python', 'NLP', 'Deep Learning', 'LLM'],
        github: '',
        demo: 'https://colab.research.google.com/drive/1r-Wum3YDymHeanmgQVAdqAm3x_IJkCDn?usp=sharing'
    },
    {
        id: 'scratch-neural-network',
        title: 'Scratch NeuralNetwork',
        description: 'A neural network built entirely from scratch in NumPy (no TensorFlow/PyTorch) for MNIST digit classification - a 2-layer feedforward net with ReLU/Softmax, He initialization, and SGD, reaching 80% test accuracy.',
        image: '/src/images/projects/scratch_neuralnet.png',
        imageAlt: 'Scratch NeuralNetwork project',
        tech_categories: ['DSA', 'Python', 'NumPy', 'Deep Learning'],
        github: '',
        demo: 'https://www.kaggle.com/code/pranavkohli2410/implementing-neural-networks-mnist'
    }
];

/**
 * HOW TO ADD A NEW PROJECT VIDEO — run every time, in this order
 * (run from: src/images/projects)
 *
 * 1. COMPRESS + FAST-START (one command does both)
 *    ffmpeg -i <name>-demo.mp4 -c:v libx264 -crf 23 -preset slow -c:a aac -b:a 128k -movflags +faststart <name>-demo-fast.mp4
 *
 *    - Never overwrite the input file directly — ffmpeg can't write
 *      to the same file it's reading. Always output to a "-fast"
 *      suffixed file first.
 *    - -crf 23 = near-lossless for screen recordings, usually a huge
 *      size cut. If output looks soft/blocky anywhere, redo with
 *      -crf 20 instead (bigger file, safer quality).
 *    - Watch the FULL output video once before trusting it, not just
 *      a quick skim — check any fast-motion/scrolling parts closely.
 *
 * 2. SWAP IT IN
 *    del <name>-demo.mp4
 *    ren <name>-demo-fast.mp4 <name>-demo.mp4
 *
 * 3. CHECK FILE SIZE — must stay under 50 MB (GitHub's limit)
 *    dir <name>-demo.mp4
 *    If still too big, re-run step 1 with a lower -crf... no wait,
 *    HIGHER -crf number (24, 26, 28) = smaller file, more compression.
 *
 * 4. GENERATE THE SCRUB-PREVIEW SPRITE SHEET
 *    First get exact duration:
 *      ffprobe -i <name>-demo.mp4 -show_entries format=duration -v quiet -of csv="p=0"
 *      eg: ffmpeg -i velvetpour-demo.mp4 -vf "fps=1/2,scale=160:-1,tile=8x7" -q:v 3 velvetpour-sprite.jpg
 *    Then pick a grid that covers (duration ÷ 2) frames, e.g. 93s → ~47 frames → 7x7 grid (49 slots).
 *    Rule of thumb: cols x rows must be >= duration / 2.
 *      ffmpeg -i <name>-demo.mp4 -vf "fps=1/2,scale=160:-1,tile=<cols>x<rows>" -q:v 3 <name>-sprite.jpg
 *
 * 5. ADD TO projects-data.js — inside that project's entry:
 *    video: "src/images/projects/<name>-demo.mp4",
 *    spriteSheet: "src/images/projects/<name>-sprite.jpg",
 *    spriteInterval: 2,
 *    spriteCols: <cols>,
 *    spriteRows: <rows>,
 *    spriteFrameWidth: 160,
 *    spriteFrameHeight: 90,   // check ffmpeg's actual output height if video isn't ~16:9
 *
 * 6. COMMIT + PUSH
 *    git add .
 *    git commit -m "Add <name> demo video"
 *    git push origin main
 *    If GitHub warns about file size again, the video wasn't
 *    compressed enough — redo step 1 with a higher -crf.
 */