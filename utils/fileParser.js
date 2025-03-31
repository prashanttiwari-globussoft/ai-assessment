const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const { extractRawText } = require('docx');
const mammoth = require('mammoth');

async function extractTextFromFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    
    try {
        if (ext === '.pdf') {
            return await extractTextFromPDF(filePath);
        } else if (ext === '.docx') {
            return await extractTextFromDOCX(filePath);
        } else if (ext === '.txt' || ext === '.text') {
            return await extractTextFromTXT(filePath);
        } else if (ext === '.doc') {
            return await extractTextFromDOC(filePath);
        } else {
            throw new Error('Unsupported file format');
        }
    } finally {
        // Clean up: delete the uploaded file after processing
        try {
            fs.unlinkSync(filePath);
        } catch (err) {
            console.error('Error deleting temporary file:', err);
        }
    }
}

async function extractTextFromPDF(filePath) {
    try {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdf(dataBuffer);
        return data.text;
    } catch (error) {
        console.error('Error extracting text from PDF:', error);
        throw new Error('Failed to extract text from PDF file');
    }
}

async function extractTextFromDOCX(filePath) {
    try {
        const dataBuffer = fs.readFileSync(filePath);
        const text = await extractRawText({ buffer: dataBuffer });
        return text;
    } catch (error) {
        console.error('Error extracting text from DOCX:', error);
        throw new Error('Failed to extract text from DOCX file');
    }
}

async function extractTextFromDOC(filePath) {
    try {
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value;
    } catch (error) {
        console.error('Error extracting text from DOC:', error);
        throw new Error('Failed to extract text from DOC file');
    }
}

async function extractTextFromTXT(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
        console.error('Error reading text file:', error);
        throw new Error('Failed to read text file');
    }
}

module.exports = { extractTextFromFile };