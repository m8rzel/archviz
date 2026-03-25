import { useState } from 'react';

export default function RenderCard({ index, result, elapsed }) {
  const [showPrompt, setShowPrompt] = useState(false);

  const handleDownload = async () => {
    if (!result?.url) return;
    try {
      const resp = await fetch(result.url);
      const blob = await resp.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `archviz-render-${index + 1}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(result.url, '_blank');
    }
  };

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <span style={styles.label}>Render #{index + 1}</span>
        {elapsed != null && (
          <span style={styles.elapsed}>{elapsed.toFixed(1)}s</span>
        )}
      </div>

      {result?.error ? (
        <div style={styles.error}>{result.error}</div>
      ) : result?.url ? (
        <>
          <img src={result.url} alt={`Render ${index + 1}`} style={styles.image} />
          <div style={styles.actions}>
            <button onClick={handleDownload} style={styles.btn}>Download</button>
            <button onClick={() => setShowPrompt(!showPrompt)} style={styles.btnOutline}>
              {showPrompt ? 'Hide Prompt' : 'View Prompt'}
            </button>
          </div>
          {showPrompt && (
            <div style={styles.promptBox}>
              <p style={styles.promptLabel}>Original prompt:</p>
              <p style={styles.promptText}>{result.prompt}</p>
              {result.revised_prompt && (
                <>
                  <p style={{ ...styles.promptLabel, marginTop: 8 }}>DALL-E revised prompt:</p>
                  <p style={styles.promptText}>{result.revised_prompt}</p>
                </>
              )}
            </div>
          )}
        </>
      ) : (
        <div style={styles.loading}>
          <div style={styles.spinner} />
          <span>Generating{elapsed != null ? ` (${elapsed.toFixed(1)}s)` : '...'}</span>
        </div>
      )}
    </div>
  );
}

const styles = {
  card: {
    background: '#1a1a1a',
    borderRadius: 12,
    border: '1px solid #2a2a2a',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: 600,
    color: '#aaa',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  elapsed: {
    fontSize: 13,
    color: '#666',
    fontFamily: 'monospace',
  },
  image: {
    width: '100%',
    borderRadius: 8,
    display: 'block',
  },
  error: {
    background: '#2a1010',
    color: '#ff6b6b',
    padding: 12,
    borderRadius: 8,
    fontSize: 13,
    fontFamily: 'monospace',
    wordBreak: 'break-word',
  },
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    padding: '60px 0',
    color: '#666',
    fontSize: 14,
  },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid #333',
    borderTopColor: '#4ea8de',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  actions: {
    display: 'flex',
    gap: 8,
  },
  btn: {
    flex: 1,
    padding: '8px 16px',
    background: '#4ea8de',
    color: '#000',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 13,
  },
  btnOutline: {
    flex: 1,
    padding: '8px 16px',
    background: 'transparent',
    color: '#4ea8de',
    border: '1px solid #4ea8de',
    borderRadius: 6,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 13,
  },
  promptBox: {
    background: '#111',
    borderRadius: 8,
    padding: 12,
    border: '1px solid #2a2a2a',
  },
  promptLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  promptText: {
    fontSize: 13,
    color: '#bbb',
    lineHeight: 1.5,
  },
};
