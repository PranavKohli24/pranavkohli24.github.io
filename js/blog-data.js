/**
 * Blog Data Configuration
 * Add new blog posts here - they will automatically appear on the site
 */

const blogPosts = [
    {
        id: 'blog1',
        title: 'How ChatGPT helped me answer much of my curiousity',
        date: 'November 2025',
        image: 'src/images/blog1.jpeg',
        imageAlt: 'Blog1 Image',
        audioFile: 'src/audio/blog1_audio.mp3',
        content: `
            <p>I've always been like this.</p>

            <p>Random thoughts pop up at random times.</p>

            <p>I'll be brushing my teeth and suddenly think, wait… how did life even begin on Earth?<br>
            Or I'll be lying on my bed and wonder how GitHub manages millions of repositories at that scale.</p>

            <p>It's just a small spark. Quiet. Curious. And once it shows up, I want to follow it.</p>

            <p>Before ChatGPT, most of those sparks died quickly. I'd Google something, open a few tabs, skim half-answers, lose interest, and move on. You know the drill.</p>

            <p>Then one night, I typed one of those thoughts into ChatGPT. No effort, no framing. Just:<br>
            <i>"So how did life even start? Explain it like I'm curious, not preparing for an exam."</i></p>

            <p>The response felt different.<br>
            Not like a lecture. More like someone talking it through with me. Clear. Calm. Almost story-like.</p>

            <p>That's when things shifted.</p>

            <p>Slowly, ChatGPT became the place I went for every "wait a second…" thought.</p>

            <p><b>Why did humans evolve the way they did?</b><br>
            <b>How did Einstein even arrive at time dilation?</b><br>
            <b>What was Earth like before anything familiar existed?</b></p>

            <p>The answers weren't just facts. They were journeys. How ideas formed. What came before. Why something mattered.</p>

            <p>It took my curiosity seriously without making it heavy.</p>

            <p>Sometimes we'd go deep into side paths. Evolution, space, ancient environments, technology. Other times, it stayed simple. Exactly what I needed in that moment.</p>

            <p>And that's what made it addictive in a good way.</p>

            <p>No pressure. No noise. Just the quiet satisfaction of following a question and seeing where it leads.</p>

            <p>It felt like having a really smart friend who's always up for talking about anything, big or small, without making it feel like homework.</p>

            <p>My curiosity wasn't something to control or optimize. It was something to enjoy.</p>

            <p>And the best part? Learning started to feel natural again.</p>

            <p>One thought led to another. Suddenly I'd learned something new without planning to. That feeling hits different when you're learning just because you want to.</p>

            <p>It's like having a personal rabbit-hole guide on standby. Whether the question is about consciousness, evolution, or why the sky looked weird that evening.</p>

            <p>My curiosity isn't loud. It's not dramatic.<br>
            It shows up quietly when things slow down.</p>

            <p>ChatGPT just gave me a way to follow those moments without friction. Turning small questions into small adventures. And some of those adventures stay with me long after.</p>

            <p>Honestly, that's all I ever wanted.</p>
        `
    },
        blog2 = {
    id: 'blog2',
    title: 'The 3 AM Breakthrough: Saving the Hackathon Demo',
    date: 'December 2025',
    image: 'src/images/blog2.jpeg',
    imageAlt: 'Hackathon team working late night',
    // audioFile: 'src/audio/blog2_audio.mp3',
    content: `
            <p>It was a 24 hour hackathon</p>
        <p>It was 3:47 AM. The submission deadline was at 8:00 AM sharp.</p>

        <p>The rest of my team was asleep on beanbags behind me. I was the only one left awake, staring at a screen that was mocking me.</p>

        <p>I'd been stuck on the same feature for six hours. The "killer feature" of our app: A live group chat. It sounded so simple. You type a message, and it appears on everyone else's screen instantly.</p>

        <p>The problem? Every time I tested it, the app went crazy. I would type "Hello" once, but the screen would show it twice. Then four times. Then ten. Within seconds, the whole app would freeze.</p>

        <p><b>Hour 4: Confidence</b><br>
        We had just finished the design. It looked great. I wrote the code to send messages back and forth. It worked perfectly on my own laptop. I felt invincible.</p>

        <p>"We're going to win this," I told my teammate.</p>

        <p><b>Hour 9: The Crash</b><br>
        We put the website live for testing. Suddenly, chaos. Messages were duplicating endlessly. It was like walking into a room of echoes where everyone is shouting at once.</p>

        <p>I rewrote the code three times. I checked the internet connection. I checked the server, debugged the code.</p>

        <p>Nothing stopped the flood of duplicate messages.</p>

        <p><b>Hour 14: Breaking Point</b><br>
        This was it. The "Hackathon Wall."</p>

        <p>I was exhausted. My eyes were burning. I had consumed three energy drinks and a questionable amount of pizza. I knew the logic was right. But the result was wrong.</p>

        <p>I considered scrapping the feature. "Maybe we just remove the chat," I thought. "Maybe we just pretend it's not finished."</p>

        <p>But I couldn't give up. Not this close to the finish line.</p>

        <p>I stepped away from the laptop. Walked to the window. Looked at the empty city streets.</p>

        <p>I stopped thinking about the code and started thinking about what I was actually telling the computer to do.</p>

        <p>I realized I had made a fundamental mistake in how I was giving instructions.</p>

        <p>Imagine you hire a receptionist to listen for the phone. Every time the phone rings, they write down the message.</p>

        <p>My mistake was that every time the screen refreshed, I was hiring a <i>new</i> receptionist. But I never told the <i>old</i> receptionist to go home.</p>

        <p>So, after ten minutes, I had 50 receptionists all listening to the same phone, all shouting the same message at the same time.</p>

        <p>I rushed back to the keyboard. I didn't need to add more code. I needed to tell the "old receptionists" to leave.</p>

        <p>I needed a "cleanup" instruction.</p>

        <p>I wrote it out, roughly translating to:</p>
        <code style="display: block; background: rgba(0,0,0,0.05); padding: 1rem; border-radius: 8px; margin: 1rem 0;">
        When the screen updates:<br>
        1. Stop listening to the old messages.<br>
        2. Start listening for new ones.
        </code>

        <p>Three lines of code. That's all it took to stop the chaos.</p>

        <p>I saved. I reloaded the page. I typed "Hello."</p>

        <p><b>"Hello" appeared exactly once.</b></p>

        <p>That feeling… that's why we do hackathons.</p>

        <p>It's not about the prizes. It's about that specific moment of clarity when the things work.</p>

        <p>You don't just fix a bug. You level up. Suddenly, a complex technical concept wasn't just a theory anymore. It was real. I understood <i>why</i> it mattered to be tidy with your code.</p>

        <p>I spent six hours on one problem. But in those six hours, I learned a lesson about attention to detail that no textbook could teach me.</p>

        <p><b>The real lesson?</b></p>

        <p>Computers do exactly what you tell them to do - even if what you tell them to do is ridiculous.</p>

        <p>In a hackathon, you can learn about frontend, backend, databases, optimisation, and pitching your ideas,, which is why I used to participate in as many hackathons I could</p>
        <p>Those hours of panic? That's just the tuition fee for the knowledge you're about to gain.</p>

        
        <br/>

        <p>But we pitched at 9 AM. The feature worked flawlessly. The judges loved the overall solution, <br/>and yes my team won the hackathon!</p>

        <p>And that euphoria of getting into the solutions. That's the thing I'm chasing.</p>

       
    `
}
    
    /* 
     * To add a new blog post, copy the template below and fill in your details:
     * 
     * ,{
     *     id: 'blog2',  // Unique ID (blog2, blog3, etc.)
     *     title: 'Your Blog Title Here',
     *     date: 'December 2025',
     *     image: 'src/images/blog2.jpeg',  // Your blog image
     *     imageAlt: 'Description of your image',
     *     audioFile: 'src/audio/blog2_audio.mp3',  // Optional: remove this line if no audio
     *     content: `
     *         <p>Your blog content goes here...</p>
     *         <p>Use HTML tags for formatting.</p>
     *         <p><b>Bold text</b> and <i>italic text</i> work too.</p>
     *     `
     * }
     * 
     * Note: Don't forget the comma before opening bracket if adding after an existing post!
     */
];