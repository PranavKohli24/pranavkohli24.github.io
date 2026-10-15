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
        description: 'A full-stack AI chat assistant simulating my personal knowledge and communication style — remembers past conversations, shares links with previews, reacts to messages with emojis, and sends photos and voice notes.',
        image: '/src/images/projects/digital-twin.webp',
        imageAlt: 'Digital Twin chat interface',
        tech_categories: ['React', 'Backend', 'Node.js', 'NLP', 'RAG'],
        github: '',
        demo: 'https://pranavkohli24.github.io/#twin'
    },
    {
        id: 'rasoi-bazaar',
        title: 'Rasoi Bazaar',
        description: 'An Indian cuisine recipe generator with 500+ dishes, attracting and retaining 10,000+ users. Features text + image search, a "cook what you have" mode, Swiggy/Instamart ordering via MCP, and an AI cooking companion that answers context-aware questions about the dish you\'re making.',
        image: '/src/images/projects/rasoi-bazaar.webp',
        imageAlt: 'Rasoi Bazaar recipe discovery interface',
        tech_categories: ['React', 'Backend', 'Node.js', 'Elastic Search', 'NLP', 'RAG'],
        github: '',
        demo: 'http://rasoi-bazaar.vercel.app/'
    },
    {
        id: 'locket',
        title: 'Locket',
        description: 'Apple Swift Student Challenge winning project — a SwiftUI locket preserving 7 life memories, with procedural particle effects and Core Haptics for an interactive feel.',
        image: '/src/images/projects/digital-locket.webp',
        imageAlt: 'Locket iOS app interface',
        tech_categories: ['iOS', 'Swift', 'SwiftUI', 'Core Haptics', 'MVVM'],
        github: 'https://github.com/PranavKohli24/Digital_Locket',
        demo: ''
    },
    {
        id: 'movie-nest',
        title: 'Movie Nest',
        description: 'A complete movie listing app built with UIKit — AutoLayout, collection views, nav controllers, Combine, and unit tests — integrated with the Studio Ghibli API, using MVVM architecture.',
        image: '/src/images/projects/movie-nest.webp',
        imageAlt: 'Movie Nest app interface',
        tech_categories: ['iOS', 'Swift', 'UIKit', 'MVVM', 'Combine'],
        github: 'https://github.com/PranavKohli24/Movie-App',
        demo: ''
    }
];