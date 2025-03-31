const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function evaluateAnswer(question, answer, maxMarks, difficulty) {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `Evaluate this coding question answer and provide a score from 0 to ${maxMarks}.
    
    Question: ${question}
    Answer: ${answer}
    
    Consider:
    - Correctness of the solution
    - Code quality and readability
    - Efficiency of the approach
    - Completeness of the answer
    
    Difficulty: ${difficulty}
    
    Return ONLY a JSON object with this structure:
    {
        "score": number,
        "feedback": "short feedback on the answer",
        "correctAns": "Provide the correct answer of that question"
    }`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = await response.text();

        // Extract JSON from the response
        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}') + 1;
        const jsonString = text.slice(jsonStart, jsonEnd);

        // Clean up the JSON string
        const cleanedJsonString = jsonString
            .replace(/[\n\r\t]/g, '')   // Remove newlines, carriage returns, tabs
            .replace(/\s+/g, ' ')       // Replace multiple spaces with a single space
            .trim();

        const evaluation = JSON.parse(cleanedJsonString);
        // console.log(evaluation)
        return evaluation.score;
    } catch (error) {
        console.error("Error evaluating answer:", error.message);
        return null;
    }
}

module.exports = { evaluateAnswer };
