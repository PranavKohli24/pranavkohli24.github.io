/**
 * Projects Data
 * Add, remove, or edit projects here. The renderer and filters update automatically.
 *
 * image: path to a thumbnail in your public/root assets, e.g. '/src/images/projects/rasoi-bazaar.webp'
 * tech_categories: combined list of category tags (must match FILTER_CATEGORIES in
 *   projects-renderer.js: iOS, React Native, Angular, React, Backend, DSA) and tech stack.
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
        tech_categories: ['React', 'Backend', 'Node.js', 'Elastic Search', 'NLP', 'RAG'],
        github: '',
        demo: 'http://rasoi-bazaar.vercel.app/'
    },
    {
        id: 'digital-locket',
        title: 'Locket',
        description: 'Apple Swift Student Challenge winning project - a SwiftUI locket preserving 7 life memories, with procedural particle effects and Core Haptics for an interactive feel.',
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
        image: '/src/images/projects/market-connect.webp',
        imageAlt: 'MarketConnect interface',
        tech_categories: ['React', 'Backend', 'Node.js', 'Express', 'MongoDB'],
        github: 'https://github.com/PranavKohli24/MarketConnect',
        demo: ''
    },
    {
        id: 'post-away',
        title: 'PostAway',
        description: 'A social media backend with secure JWT authentication for signup, login, and logout. Built a comment/like/post system tested with 200+ queries, and documented the full API with Swagger UI for easy exploration and testing.',
        image: '/src/images/projects/post-away.webp',
        imageAlt: 'PostAway backend API',
        tech_categories: ['Backend', 'Node.js', 'MongoDB', 'RESTful API'],
        github: 'https://github.com/PranavKohli24/PostAway_Social',
        demo: ''
    },
    {
        id: 'foodly',
        title: 'Foodly',
        description: 'A full-stack food delivery mobile app with 10+ screens including cart, debounced search, and seamless navigation using React Navigation and Expo Router.',
        image: '/src/images/projects/foodly.webp',
        imageAlt: 'Foodly app interface',
        tech_categories: ['React Native', 'Redux', 'Zustand', 'Firebase', 'Expo'],
        github: 'https://github.com/PranavKohli24/Foodly',
        demo: ''
    },
    {
        id: 'mocktails',
        title: 'Velvet Pour',
        description: 'A scroll-synced mocktail shop app that enhances engagement through adaptive visual storytelling.',
        image: '/src/images/projects/mocktails.webp',
        imageAlt: 'Velvet Pour mocktail shop interface',
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
        image: '/src/images/projects/chatrify.webp',
        imageAlt: 'Chatrify real-time chat interface',
        tech_categories: ['React', 'Backend', 'Next.js', 'Node.js', 'Express', 'MongoDB', 'Socket.io'],
        github: '',
        demo: 'https://youtu.be/aN6EdAvwAhQ'
    },
    {
        id: 'gpt-transformer-architecture',
        title: 'GPT Transformer Architecture',
        description: 'An in-depth study and hands-on exploration of "Attention Is All You Need," the research paper that introduced the Transformer architecture underlying ChatGPT.',
        image: '/src/images/projects/gpt-transformer-architecture.webp',
        imageAlt: 'GPT Transformer Architecture project',
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