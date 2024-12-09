import os
from flask import Flask, request, jsonify, render_template # type: ignore
from werkzeug.utils import secure_filename # type: ignore
import fitz
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

app.config['UPLOAD_FOLDER'] = 'uploads'
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
api_key = os.getenv('OPENAI_API_KEY')
client = OpenAI(api_key=api_key)
chats = {}

def extract_text_from_pdf(pdf_path):
    try:
        doc = fitz.open(pdf_path)
        text = ""
        for page in doc:
            text += page.get_text()
        doc.close()
        return text
    except Exception as e:
        raise RuntimeError(f"Error extracting text from PDF: {e}")

def find_relevant_segment(pdf_content, question):
    segments = pdf_content.split("\n\n")
    question_lower = question.lower()
    relevant_segment = max(segments, key=lambda seg: seg.lower().count(question_lower))
    return relevant_segment[:3000]

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/new_chat', methods=['POST'])
def new_chat():
    chat_id = f"chat-{len(chats) + 1}"
    chats[chat_id] = {
        "messages": [],
        "pdf_content": ""
    }
    return jsonify({"chat_id": chat_id})

@app.route('/upload', methods=['POST'])
def upload_pdf():
    chat_id = request.form.get('chat_id')

    if not chat_id or chat_id not in chats:
        chat_id = f"chat-{len(chats) + 1}"
        chats[chat_id] = {"messages": [], "pdf_content": ""}

    uploaded_file = request.files.get('file')
    if not uploaded_file or not uploaded_file.filename.endswith('.pdf'):
        return jsonify({"error": "Only PDF files are accepted"}), 400

    filename = secure_filename(uploaded_file.filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    uploaded_file.save(filepath)

    try:
        pdf_text = extract_text_from_pdf(filepath)
        chats[chat_id]['pdf_content'] = pdf_text
        return jsonify({
            "message": "File uploaded successfully",
            "chat_id": chat_id,
            "preview": pdf_text[:500] + "..." if len(pdf_text) > 500 else pdf_text
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/ask', methods=['POST'])
def chat():
    chat_id = request.form.get('chat_id')

    if not chat_id or chat_id not in chats:
        chat_id = f"chat-{len(chats) + 1}"
        chats[chat_id] = {"messages": [], "pdf_content": ""}

    message = request.form.get('question')
    if not message:
        return jsonify({"error": "Message cannot be empty"}), 400

    pdf_context = chats[chat_id].get('pdf_content', '')
    if not pdf_context:
        return jsonify({"error": "Please upload a PDF file before asking questions."}), 400

    relevant_segment = find_relevant_segment(pdf_context, message)

    messages = [
        {"role": "system", "content": "You are an assistant that answers questions based on a provided PDF document."},
        {"role": "system", "content": f"Relevant PDF context: {relevant_segment}"},
        *chats[chat_id].get('messages', []),
        {"role": "user", "content": message}
    ]

    try:
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=messages
        )
        ai_response = response.choices[0].message.content

        chats[chat_id]['messages'].extend([
            {"role": "user", "content": message},
            {"role": "assistant", "content": ai_response}
        ])
        return jsonify({"response": ai_response, "chat_id": chat_id})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/clear_chat', methods=['POST'])
def clear_chat():
    chat_id = request.json.get('chat_id')

    if not chat_id or chat_id not in chats:
        return jsonify({"error": "Invalid chat session ID"}), 400

    chats[chat_id]['messages'] = []
    chats[chat_id]['pdf_content'] = ""
    return jsonify({"message": "Chat history cleared"})

if __name__ == '__main__':
    app.run(debug=True)
