/**
 * Projects Data
 * Add, remove, or edit projects here. The renderer and filters update automatically.
 *
 * image: path to a thumbnail in your public/root assets, e.g. '/src/images/projects/rasoi-bazaar.webp'
 * categories: use one or more of: 'iOS', 'React Native', 'Angular', 'React', 'Backend', 'DSA'
 * github and demo are optional. Leave them as empty strings to hide their buttons.
 */
window.projects = [
    {
        id: 'digital-twin',
        title: 'Digital Twin',
        description: 'An interactive AI version of me that answers questions about my work, projects, and experience.',
        image: '/src/images/projects/digital-twin.webp',
        imageAlt: 'Digital Twin chat interface',
        // Category tags (must match FILTER_CATEGORIES in
        // projects-renderer.js) and tech stack live in one array.
        // List each item once — no need to repeat a category that's
        // also a technology.
        tech_categories: ['React', 'Backend', 'JavaScript', 'Cloudflare Workers AI', 'RAG', 'Vectorize'],
        github: '',
        demo: 'https://pranavkohli24.github.io/#twin'
    },
    {
        id: 'rasoi-bazaar',
        title: 'Rasoi Bazaar',
        description: 'A recipe discovery experience focused on helping people decide what to cook and explore dishes.',
        image: '/src/images/projects/rasoi-bazaar.webp',
        imageAlt: 'Rasoi Bazaar recipe discovery interface',
        tech_categories: ['React', 'Google Gemini', 'Vercel'],
        github: '',
        demo: 'http://rasoi-bazaar.vercel.app/'
    },
    {
        id: 'chatrify',
        title: 'Chatrify',
        description: 'A real-time chat application with AI-assisted message tagging.',
        image: '/src/images/projects/chatrify.webp',
        imageAlt: 'Chatrify real-time chat interface',
        tech_categories: ['React', 'Backend', 'Node.js', 'Express', 'Socket.io', 'Gemini API'],
        github: '',
        demo: ''
    }
];
