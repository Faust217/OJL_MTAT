import { useNavigate } from 'react-router-dom';
import MeetingAnalyzer from '../components/MeetingAnalyzer';

function UploadPage() {
  const navigate = useNavigate();

  return (
    <div style={{ backgroundColor: '#f7f9fa', minHeight: '100vh', padding: '2rem' }}>
      <div style={{ maxWidth: '900px', margin: 'auto', backgroundColor: 'white', padding: '2rem', borderRadius: '10px', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>
        <button
          onClick={() => navigate("/")}
          style={{ backgroundColor: '#e0e0e0', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', marginBottom: '1rem' }}
        >
          ⬅️ Back to Home
        </button>

        <h2 style={{ textAlign: 'center', fontSize: '1.8rem', marginBottom: '1.5rem', color: '#333' }}>📤 Upload & Analyze Your Meeting</h2>

        <MeetingAnalyzer />
      </div>
    </div>
  );
}

export default UploadPage;
