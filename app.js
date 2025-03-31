require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { extractTextFromFile } = require('./utils/fileParser');
const { evaluateAnswer } = require('./utils/scoring');
const app = express();

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Configure file upload
const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const filetypes = /pdf|docx|txt|text/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        
        if (extname && mimetype) {
            return cb(null, true);
        }
        cb(new Error('Only PDF, DOCX, and TXT files are allowed!'));
    }
});

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Store test data in memory
let testSessions = {};

// Routes
app.get('/', (req, res) => {
    res.render('index',{ error: null });
});

app.post('/generate-questions', upload.single('resume'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).render('index', { error: 'Please upload a resume file' });
        }

        // Show loading screen while processing
        const sessionId = Date.now().toString();
        res.render('loading', { sessionId });

        // Process in background
        setTimeout(async () => {
            try {
                const resumeText = await extractTextFromFile(req.file.path);
                const questions = await generateQuestions(resumeText);
                
                testSessions[sessionId] = {
                    questions,
                    currentQuestionIndex: 0,
                    answers: {},
                    scores: {
                        easy: { total: questions?.easy.length > 0 ? questions?.easy.length * 10 : 0, earned: 0 },
                        medium: { total: questions?.medium.length > 0 ? questions?.medium.length * 20 : 0, earned: 0 },
                        hard: { total: questions?.hard.length > 0 ? questions?.hard.length * 40 : 0, earned: 0 }
                    },
                    startTime: Date.now(),
                    completed: false,
                    rightAns:null
                };
            } catch (error) {
                console.error('Background processing error:', error);
            }
        }, 0);
    } catch (error) {
        console.error(error);
        res.status(500).render('index', { error: error.message });
    }
});

app.get('/question/:sessionId', (req, res) => {
    const sessionId = req.params.sessionId;
    const session = testSessions[sessionId];
    
    if (!session) {
        return res.status(404).send('Test session not found');
    }
    
    if (session.completed) {
        return res.redirect(`/results/${sessionId}`);
    }
    const allQuestions = [...session.questions.easy, ...session.questions.medium, ...session.questions.hard];
    const currentQuestion = allQuestions[session.currentQuestionIndex];
    res.render('question', {
        question: currentQuestion,
        sessionId,
        questionNumber: session.currentQuestionIndex + 1,
        totalQuestions: allQuestions.length,
        progress: Math.round((session.currentQuestionIndex / allQuestions.length) * 100)
    });
});

app.post('/submit-answer/:sessionId', async (req, res) => {
    const sessionId = req.params.sessionId;
    const session = testSessions[sessionId];
    const { answer, action } = req.body;
    
    if (!session) {
        return res.status(404).send('Test session not found');
    }
    
    const allQuestions = [...session.questions.easy, ...session.questions.medium, ...session.questions.hard];
    const currentQuestion = allQuestions[session.currentQuestionIndex];
    
    // Store answer even if skipped
    session.answers[currentQuestion.id] = answer || 'Skipped';
    
    // Evaluate answer if submitted (not skipped)
    if (action === 'submit' && answer) {
        try {
            const score = await evaluateAnswer(
                currentQuestion.question,
                answer,
                currentQuestion.marks,
                currentQuestion.id.includes('easy') ? 'easy' : 
                currentQuestion.id.includes('medium') ? 'medium' : 'hard'
            );
            // Update score
            if (currentQuestion.id.includes('easy')) {
                session.scores.easy.earned += score;
            } else if (currentQuestion.id.includes('medium')) {
                session.scores.medium.earned += score;
            } else {
                session.scores.hard.earned += score;
            }
        } catch (error) {
            console.error('Error evaluating answer:', error);
        }
    }
    
    // Move to next question or end test
    if (action === 'end-test' || session.currentQuestionIndex >= allQuestions.length - 1) {
        session.completed = true;
        return res.redirect(`/results/${sessionId}`);
    }
    
    session.currentQuestionIndex += 1;
    res.redirect(`/question/${sessionId}`);
});

app.get('/results/:sessionId', (req, res) => {
    const sessionId = req.params.sessionId;
    const session = testSessions[sessionId];
    
    if (!session) {
        return res.status(404).send('Test session not found');
    }
    
    const totalScore = session.scores.easy.earned + 
                     session.scores.medium.earned + 
                     session.scores.hard.earned;
    const maxScore = session.scores.easy.total + 
                    session.scores.medium.total + 
                    session.scores.hard.total;
    
    // Generate detailed feedback
    const feedback = generateDetailedFeedback(session, totalScore, maxScore);
    
    res.render('result', {
        scores: session.scores,
        totalScore,
        maxScore,
        feedback,
        questions: [...session.questions.easy, ...session.questions.medium, ...session.questions.hard],
        answers: session.answers,
        timeSpent: formatTime(Date.now() - session.startTime)
    });
});

app.post('/generate-skill-questions', async (req, res) => {
    try {
        const { skills, difficulty, questionCount } = req.body;
        const sessionId = Date.now().toString();
        
        // Show loading screen while processing
        res.render('loading', { sessionId });

        // Process in background
        setTimeout(async () => {
            try {
                // Generate questions based on selected skills
                const questions = await generateSkillBasedQuestions(skills, difficulty, questionCount);
                
                testSessions[sessionId] = {
                    questions,
                    currentQuestionIndex: 0,
                    answers: {},
                    scores: {
                        easy: { total: questions?.easy.length > 0 ? questions?.easy.length * 10 : 0, earned: 0 },
                        medium: { total: questions?.medium.length > 0 ? questions?.medium.length * 20 : 0, earned: 0 },
                        hard: { total: questions?.hard.length > 0 ? questions?.hard.length * 40 : 0, earned: 0 }
                    },
                    startTime: Date.now(),
                    completed: false,
                    rightAns: null,
                    assessmentType: 'skills' // Add assessment type
                };
            } catch (error) {
                console.error('Background processing error:', error);
            }
        }, 0);
    } catch (error) {
        console.error(error);
        res.status(500).render('index', { error: 'Error generating skill-based questions' });
    }
});

// Helper function for skill-based questions
async function generateSkillBasedQuestions(skills, difficulty, count) {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const prompt = `Generate ${count} coding questions focusing on these skills: ${Array.isArray(skills) ? skills.join(', ') : skills}.
    Difficulty level: ${difficulty}.
    For each question, include:
    - id: unique identifier
    - question: the actual question text
    - marks: point value (10 for easy, 20 for medium, 40 for hard)
    - timeLimit: in minutes (10 for easy, 30 for medium, 60 for hard)
    - keyPoints: array of important concepts the answer should cover
    - correctAnswer: a sample correct answer
    
    Return a valid JSON object formatted as follows:
    {
        "easy": [
            { "id": "easy1", "question": "...", "marks": 10, "timeLimit": 10, "keyPoints": [...], "correctAnswer": "..." },
            { "id": "easy2", "question": "...", "marks": 10, "timeLimit": 10, "keyPoints": [...], "correctAnswer": "..." }
        ],
        "medium": [
            { "id": "medium1", "question": "...", "marks": 20, "timeLimit": 30, "keyPoints": [...], "correctAnswer": "..." },
            { "id": "medium2", "question": "...", "marks": 20, "timeLimit": 30, "keyPoints": [...], "correctAnswer": "..." }
        ],
        "hard": [
            { "id": "hard1", "question": "...", "marks": 40, "timeLimit": 60, "keyPoints": [...], "correctAnswer": "..." }
        ]
    }`;
    
    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = await response.text();

        // Attempt to find the JSON part directly
        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}') + 1;
        const jsonString = text.slice(jsonStart, jsonEnd);

        // Try parsing the JSON
        return JSON.parse(jsonString);
    } catch (error) {
        console.error("Error generating questions:", error);
        return null;
    }
}

// Helper functions
async function generateQuestions(resumeText) {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    // Simplified and more analytical prompt to avoid recitation
    const prompt = `Analyze the following resume of a developer and generate coding questions suitable for evaluating skills based on the candidate's experience and technical expertise.
    
    Requirements:
    1. Generate 2 easy coding questions (10 marks each, 10 minutes each).
    2. Generate 2 medium coding questions (20 marks each, 30 minutes each).
    3. Generate 1 hard coding question (40 marks, 60 minutes).
    
    Structure the output in JSON format like this:
    {
        "easy": [
            { "id": "easy1", "question": "...", "marks": 10, "timeLimit": 10, "keyPoints":[...], "correctAnswer":"..." },
            { "id": "easy2", "question": "...", "marks": 10, "timeLimit": 10, "keyPoints":[...], "correctAnswer":"..." }
        ],
        "medium": [
            { "id": "medium1", "question": "...", "marks": 20, "timeLimit": 30, "keyPoints":[...], "correctAnswer":"..." },
            { "id": "medium2", "question": "...", "marks": 20, "timeLimit": 30, "keyPoints":[...], "correctAnswer":"..." }
        ],
        "hard": [
            { "id": "hard1", "question": "...", "marks": 40, "timeLimit": 60, "keyPoints":[...], "correctAnswer":"..." }
        ]
    }
    
    Focus on questions that assess problem-solving, coding skills, and familiarity with key technologies.
    
    Resume Summary:
    ${resumeText}`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = await response.text();
        
        // Attempt to extract JSON from the response
        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}') + 1;
        const jsonString = text.slice(jsonStart, jsonEnd);

        return JSON.parse(jsonString);
    } catch (error) {
        console.error("Error generating questions:", error);
        throw new Error("Failed to generate questions");
    }
}

function generateDetailedFeedback(session, score, maxScore) {
    const percentage = (score / maxScore) * 100;
    const allQuestions = [...session.questions.easy, ...session.questions.medium, ...session.questions.hard];
    
    let feedback = `You scored ${score}/${maxScore} (${percentage.toFixed(1)}%). `;
    
    // Overall performance
    if (percentage >= 80) {
        feedback += "Excellent performance! You demonstrate strong coding skills suitable for senior developer roles. ";
    } else if (percentage >= 60) {
        feedback += "Good performance. Your skills are appropriate for mid-level developer positions. ";
    } else if (percentage >= 40) {
        feedback += "Average performance. Consider practicing more before applying for developer roles. ";
    } else {
        feedback += "Below average performance. We recommend strengthening your coding fundamentals. ";
    }
    
    // Skill-specific feedback
    const easyPercentage = (session.scores.easy.earned / session.scores.easy.total) * 100;
    const mediumPercentage = (session.scores.medium.earned / session.scores.medium.total) * 100;
    const hardPercentage = (session.scores.hard.earned / session.scores.hard.total) * 100;
    
    feedback += "<br><br>Skill Breakdown:<br>";
    feedback += `- Basic Concepts: ${easyPercentage? easyPercentage.toFixed(1) : 0}% (${session.scores.easy.earned}/${session.scores.easy.total})<br>`;
    feedback += `- Intermediate Skills: ${mediumPercentage? mediumPercentage.toFixed(1) :0}% (${session.scores.medium.earned}/${session.scores.medium.total})<br>`;
    feedback += `- Advanced Problems: ${hardPercentage? hardPercentage.toFixed(1) : 0}% (${session.scores.hard.earned}/${session.scores.hard.total})<br>`;
    
    // Question-specific feedback
    feedback += "<br>Question Analysis:<br>";
    allQuestions.forEach((q, index) => {
        const answer = session.answers[q.id];
        feedback += `<br>Q${index + 1}: ${q.question}<br>`;
        feedback += `Your answer: ${answer || 'Skipped'}<br>`;
        feedback += `Key points: ${q.keyPoints.join(', ')}<br>`;
    });
    
    return feedback;
}


function formatTime(ms) {
    const seconds = Math.floor(ms / 1000) % 60;
    const minutes = Math.floor(ms / (1000 * 60)) % 60;
    const hours = Math.floor(ms / (1000 * 60 * 60));
    
    return `${hours}h ${minutes}m ${seconds}s`;
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});