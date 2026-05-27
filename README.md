# DocuMind 

DocuMind is a modern, full-stack Retrieval-Augmented Generation (RAG) application that allows users to upload PDF documents, intelligently chunk and index their contents into a vector database, and perform interactive Q&A with an AI assistant using Google's Gemini LLM. 

It features stateless JWT authentication for multi-tenant document isolation, meaning multiple users can use the platform securely without seeing each other's documents.

## 🚀 Key Features
- **Multi-Tenant Authentication:** Simple JWT-based auth separating documents by user.
- **Advanced Chunking Strategies:** Choose between Fixed-size, Sentence-based, or Semantic chunking.
- **Compare Mode:** Simultaneously query all three chunking strategies to compare LLM answers and retrieval quality.
- **Real-Time Streaming:** NDJSON streaming architecture for fast, typewriter-style LLM responses.
- **Beautiful UI:** Built with React, Tailwind CSS, and Lucide icons for a premium feel.

---

## 🛠️ Technology Stack
- **Frontend:** React, Vite, Tailwind CSS, Axios
- **Backend:** FastAPI, Python, Uvicorn, Python-jose (JWT)
- **Vector Database:** Qdrant (Cloud)
- **Embedding Model:** `sentence-transformers/all-MiniLM-L6-v2`
- **LLM:** Google Gemini (`gemini-1.5-flash`)

---

## 📁 File Structure & Key Files

### Backend (`/backend`)
The backend is built with FastAPI and organized into a modular architecture.

- **`app/main.py`**: The entry point of the FastAPI application. Handles CORS setup, lifespan events (background model loading), and router inclusion.
- **`app/config.py`**: Configuration management using Pydantic Settings. Loads environment variables (API keys, DB URLs).
- **`app/routers/`**:
  - `auth.py`: Handles the `/login` endpoint and JWT generation.
  - `upload.py`: Handles PDF uploads, invokes the chunker, embedder, and vector store.
  - `query.py`: Handles `/ask` (streaming Q&A), `/compare` (compare mode), and `/documents` (list/delete).
- **`app/services/`**:
  - `auth.py`: JWT validation and the `get_current_user` dependency.
  - `chunker.py`: Logic for Fixed, Sentence, and Semantic chunking using NLTK and sentence-transformers.
  - `embedder.py`: Singleton service for local dense vector generation using HuggingFace models.
  - `vector_store.py`: Abstraction layer for interacting with Qdrant, handling multi-tenant metadata tagging.
  - `llm.py`: Integration with Google Gemini, including prompt engineering and streaming logic.

### Frontend (`/frontend`)
The frontend is a fast, responsive Single Page Application (SPA) built with React and Vite.

- **`src/App.jsx`**: The main layout component tying together the Sidebar, Chat, and Upload zones. Handles global state and auth triggers.
- **`src/api/client.js`**: Axios configuration with an interceptor to automatically attach JWT tokens to outbound requests.
- **`src/components/`**:
  - `ChatWindow.jsx`: The main messaging interface. Handles standard chat and Compare Mode UI.
  - `UploadZone.jsx`: Drag-and-drop PDF upload component with chunking strategy selection.
  - `DocList.jsx`: The sidebar displaying a user's uploaded documents.
  - `LoginModal.jsx`: The stateless authentication UI popup.
- **`src/hooks/`**:
  - `useChat.js`: Handles NDJSON streaming connections and chat state management.
  - `useUpload.js`: Manages the multi-part form upload flow and progress indicators.

---

## ⚙️ Local Setup Instructions

### Prerequisites
- Python 3.10+
- Node.js 18+
- A [Qdrant Cloud](https://qdrant.tech/) Cluster (URL and API Key)
- A [Google Gemini](https://aistudio.google.com/) API Key

### 1. Backend Setup
Open a terminal and navigate to the `backend` directory:
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows use `venv\Scripts\activate`
pip install -r requirements.txt
```

Create a `.env` file in the `backend` directory:
```env
GEMINI_API_KEY=your_gemini_key_here
QDRANT_URL=https://your-cluster.cloud.qdrant.io
QDRANT_API_KEY=your_qdrant_key_here
```

Run the server:
```bash
uvicorn app.main:app --reload
```

### 2. Frontend Setup
Open a new terminal and navigate to the `frontend` directory:
```bash
cd frontend
npm install
```

Create a `.env.local` file in the `frontend` directory:
```env
VITE_API_BASE=http://127.0.0.1:8000
```

Start the development server:
```bash
npm run dev
```

Your app will now be running locally at `http://localhost:5173`!
