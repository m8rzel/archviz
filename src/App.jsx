import { useState, useRef, useCallback, useEffect } from 'react';
import RenderCard from './components/RenderCard.jsx';

const STYLES = [
  'Photorealistic', 'Watercolor', 'Pencil Sketch', 'Blueprint',
  'Brutalist', 'Nordic Minimal', 'Aerial View', 'Night Render',
];
const TIMES = ['Dawn', 'Morning', 'Noon', 'Afternoon', 'Golden Hour', 'Dusk', 'Night'];
const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
const ENVIRONMENTS = ['Urban', 'Suburban', 'Rural', 'Coastal', 'Mountain', 'Desert', 'Forest'];
const MATERIALS = ['Concrete', 'Glass & Steel', 'Wood', 'Brick', 'Stone', 'Mixed Media'];

export default function App() {
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [style, setStyle] = useState(STYLES[0]);
  const [timeOfDay, setTimeOfDay] = useState(TIMES[4]);
  const [season, setSeason] = useState(SEASONS[1]);
  const [environment, setEnvironment] = useState(ENVIRONMENTS[0]);
  const [material, setMaterial] = useState(MATERIALS[0]);
  const [mood, setMood] = useState(50);
  const [detail, setDetail] = useState(70);
  const [logs, setLogs] = useState([]);
  const [renders, setRenders] = useState([null, null, null]);
  const [elapsedTimes, setElapsedTimes] = useState([null, null, null]);
  const [processing, setProcessing] = useState(false);
  const [detected, setDetected] = useState('');
  const fileRef = useRef();
  const timerRefs = useRef([]);
  const logEndRef = useRef();

  const log = useCallback((msg) => {
    const ts = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${ts}] ${msg}`]);
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setImage(file);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files[0]);
  };

  const generate = async () => {
    if (!preview) return log('ERROR: Please upload an architectural drawing.');

    setProcessing(true);
    setRenders([null, null, null]);
    setElapsedTimes([null, null, null]);
    setDetected('');
    setLogs([]);

    const headers = { 'Content-Type': 'application/json' };

    // Step 1: Analyze with GPT-4o
    log('Sending image to GPT-4o for analysis...');
    let prompts;
    try {
      const resp = await fetch('/api/analyze', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          imageBase64: preview,
          style, timeOfDay, season, environment, material, mood, detail,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      log(`HTTP 200 — GPT-4o analysis complete.`);
      log(`Detected: ${data.detected}`);
      setDetected(data.detected);
      prompts = [data.prompt1, data.prompt2, data.prompt3];
    } catch (err) {
      log(`ERROR (GPT-4o): ${err.message}`);
      setProcessing(false);
      return;
    }

    // Step 2: Fire 3 parallel DALL-E renders
    log('Firing 3 gpt-image-1 render requests in parallel...');
    const startTimes = [Date.now(), Date.now(), Date.now()];

    // Start elapsed timers
    timerRefs.current.forEach((t) => clearInterval(t));
    timerRefs.current = prompts.map((_, i) =>
      setInterval(() => {
        setElapsedTimes((prev) => {
          const next = [...prev];
          next[i] = (Date.now() - startTimes[i]) / 1000;
          return next;
        });
      }, 100)
    );

    const renderPromises = prompts.map(async (prompt, i) => {
      try {
        log(`Render #${i + 1}: Sending to gpt-image-1...`);
        const resp = await fetch('/api/render', {
          method: 'POST',
          headers,
          body: JSON.stringify({ prompt, imageBase64: preview }),
        });
        const data = await resp.json();
        clearInterval(timerRefs.current[i]);
        const elapsed = (Date.now() - startTimes[i]) / 1000;

        if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);

        log(`Render #${i + 1}: Complete (${elapsed.toFixed(1)}s)`);
        setRenders((prev) => {
          const next = [...prev];
          next[i] = { url: data.url, prompt, revised_prompt: data.revised_prompt };
          return next;
        });
        setElapsedTimes((prev) => {
          const next = [...prev];
          next[i] = elapsed;
          return next;
        });
      } catch (err) {
        clearInterval(timerRefs.current[i]);
        const elapsed = (Date.now() - startTimes[i]) / 1000;
        log(`ERROR Render #${i + 1}: ${err.message}`);
        setRenders((prev) => {
          const next = [...prev];
          next[i] = { error: err.message, prompt };
          return next;
        });
        setElapsedTimes((prev) => {
          const next = [...prev];
          next[i] = elapsed;
          return next;
        });
      }
    });

    await Promise.all(renderPromises);
    log('All renders complete.');
    setProcessing(false);
  };

  return (
    <div style={styles.root}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input[type=range] { accent-color: #4ea8de; }
        ::selection { background: #4ea8de33; }
      `}</style>

      {/* Header */}
      <header style={styles.header}>
        <h1 style={styles.title}>
          <span style={{ color: '#4ea8de' }}>Arch</span>Viz AI
        </h1>
        <p style={styles.subtitle}>AI-Powered Architectural Rendering</p>
      </header>

      <div style={styles.layout}>
        {/* Left Panel — Controls */}
        <aside style={styles.sidebar}>
          {/* Upload */}
          <Section title="Upload Drawing">
            <div
              style={{
                ...styles.dropzone,
                borderColor: preview ? '#4ea8de' : '#333',
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              {preview ? (
                <img src={preview} alt="Preview" style={styles.previewImg} />
              ) : (
                <p style={{ color: '#666', fontSize: 14 }}>
                  Drag & drop or click to upload<br />
                  <span style={{ fontSize: 12 }}>Floor plans, sketches, elevations</span>
                </p>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => handleFile(e.target.files[0])}
              />
            </div>
          </Section>

          {/* Render Style */}
          <Section title="Render Style">
            <div style={styles.chipGrid}>
              {STYLES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStyle(s)}
                  style={{
                    ...styles.chip,
                    ...(style === s ? styles.chipActive : {}),
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </Section>

          {/* Parameters */}
          <Section title="Parameters">
            <Label text="Time of Day">
              <select value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} style={styles.select}>
                {TIMES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Label>
            <Label text="Season">
              <select value={season} onChange={(e) => setSeason(e.target.value)} style={styles.select}>
                {SEASONS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Label>
            <Label text="Environment">
              <select value={environment} onChange={(e) => setEnvironment(e.target.value)} style={styles.select}>
                {ENVIRONMENTS.map((e) => <option key={e}>{e}</option>)}
              </select>
            </Label>
            <Label text="Material">
              <select value={material} onChange={(e) => setMaterial(e.target.value)} style={styles.select}>
                {MATERIALS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </Label>
            <Label text={`Mood: ${mood}`}>
              <input type="range" min={0} max={100} value={mood} onChange={(e) => setMood(+e.target.value)} style={styles.range} />
            </Label>
            <Label text={`Detail: ${detail}`}>
              <input type="range" min={0} max={100} value={detail} onChange={(e) => setDetail(+e.target.value)} style={styles.range} />
            </Label>
          </Section>

          <button
            onClick={generate}
            disabled={processing}
            style={{
              ...styles.generateBtn,
              opacity: processing ? 0.5 : 1,
              cursor: processing ? 'not-allowed' : 'pointer',
            }}
          >
            {processing ? 'Generating...' : 'Generate Renders'}
          </button>
        </aside>

        {/* Right Panel — Output */}
        <main style={styles.main}>
          {/* Log Panel */}
          {logs.length > 0 && (
            <div style={styles.logPanel}>
              <div style={styles.logHeader}>Processing Log</div>
              <div style={styles.logBody}>
                {logs.map((l, i) => (
                  <div key={i} style={{
                    ...styles.logLine,
                    color: l.includes('ERROR') ? '#ff6b6b' : l.includes('Complete') ? '#6bff6b' : '#999',
                  }}>
                    {l}
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>
          )}

          {/* Detected */}
          {detected && (
            <div style={styles.detectedBox}>
              <strong>Detected:</strong> {detected}
            </div>
          )}

          {/* Render Cards */}
          {renders.some((r) => r !== null || processing) && (
            <div style={styles.renderGrid}>
              {renders.map((result, i) => (
                <RenderCard key={i} index={i} result={result} elapsed={elapsedTimes[i]} />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!processing && renders.every((r) => r === null) && logs.length === 0 && (
            <div style={styles.empty}>
              <div style={{ fontSize: 48, opacity: 0.15, marginBottom: 16 }}>&#9634;</div>
              <p style={{ color: '#444', fontSize: 15 }}>
                Upload a drawing and configure your render settings to get started.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={styles.sectionTitle}>{title}</h3>
      {children}
    </div>
  );
}

function Label({ text, children }) {
  return (
    <label style={styles.label}>
      <span style={styles.labelText}>{text}</span>
      {children}
    </label>
  );
}

const styles = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    padding: '24px 32px',
    borderBottom: '1px solid #1a1a1a',
    display: 'flex',
    alignItems: 'baseline',
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: '#555',
  },
  layout: {
    display: 'flex',
    flex: 1,
    minHeight: 0,
  },
  sidebar: {
    width: 340,
    minWidth: 340,
    padding: 24,
    borderRight: '1px solid #1a1a1a',
    overflowY: 'auto',
    height: 'calc(100vh - 73px)',
  },
  main: {
    flex: 1,
    padding: 24,
    overflowY: 'auto',
    height: 'calc(100vh - 73px)',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    background: '#141414',
    border: '1px solid #2a2a2a',
    borderRadius: 6,
    color: '#ddd',
    fontSize: 13,
    outline: 'none',
    fontFamily: 'monospace',
  },
  dropzone: {
    border: '2px dashed #333',
    borderRadius: 10,
    padding: 24,
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'border-color 0.2s',
    minHeight: 120,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImg: {
    maxWidth: '100%',
    maxHeight: 200,
    borderRadius: 6,
  },
  chipGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    padding: '6px 12px',
    fontSize: 12,
    border: '1px solid #2a2a2a',
    borderRadius: 20,
    background: '#141414',
    color: '#888',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  chipActive: {
    background: '#4ea8de22',
    borderColor: '#4ea8de',
    color: '#4ea8de',
  },
  select: {
    width: '100%',
    padding: '8px 10px',
    background: '#141414',
    border: '1px solid #2a2a2a',
    borderRadius: 6,
    color: '#ddd',
    fontSize: 13,
    outline: 'none',
  },
  range: {
    width: '100%',
    marginTop: 4,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    marginBottom: 12,
  },
  labelText: {
    fontSize: 12,
    color: '#666',
  },
  generateBtn: {
    width: '100%',
    padding: '14px',
    background: '#4ea8de',
    color: '#000',
    border: 'none',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: 0.5,
    marginTop: 8,
  },
  logPanel: {
    background: '#111',
    borderRadius: 10,
    border: '1px solid #1e1e1e',
    overflow: 'hidden',
  },
  logHeader: {
    padding: '10px 14px',
    fontSize: 11,
    fontWeight: 600,
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 1,
    borderBottom: '1px solid #1e1e1e',
  },
  logBody: {
    padding: 14,
    maxHeight: 180,
    overflowY: 'auto',
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 1.8,
  },
  logLine: {
    color: '#999',
  },
  detectedBox: {
    background: '#141e28',
    border: '1px solid #1e3a50',
    borderRadius: 8,
    padding: '12px 16px',
    fontSize: 14,
    color: '#8ec8e8',
  },
  renderGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))',
    gap: 16,
  },
  empty: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
};
