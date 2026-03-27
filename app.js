const STORAGE_KEY = 'blindtest_v7_ultra_simple_state';
const CHANNEL_NAME = 'blindtest_v7_ultra_simple_sync';
const DEFAULT_MEDIA_URL = 'http://MacBook-Pro-de-Clement.local:8787';

const defaultState = {
  title: 'Blind Test Anniversaire',
  subtitle: 'Pupitre simple',
  questionLabel: 'Question 1',
  mediaServerUrl: DEFAULT_MEDIA_URL,
  lastUpdated: Date.now(),
  teams: [
    {id:'merguez',name:'Merguez',color:'#8B5CF6',score:0},
    {id:'camaro',name:'Camaro',color:'#22C55E',score:0},
    {id:'monaco',name:'Monaco',color:'#3B82F6',score:0},
    {id:'amnesia',name:'Amnesia',color:'#FACC15',score:0}
  ],
  history: []
};

const channel = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL_NAME) : null;
let toastTimeout = null;

function clone(o){ return JSON.parse(JSON.stringify(o)); }
function esc(s=''){ return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;"); }
function randomId(){ return window.crypto?.randomUUID ? window.crypto.randomUUID() : 'id-'+Math.random().toString(36).slice(2)+Date.now(); }
function fmtDate(ts){ return new Date(ts).toLocaleString('fr-FR', {dateStyle:'short', timeStyle:'medium'}); }

function migrateState(input){
  const s = Object.assign(clone(defaultState), input || {});
  s.teams = Array.isArray(s.teams) && s.teams.length ? s.teams : clone(defaultState.teams);
  s.history = Array.isArray(s.history) ? s.history : [];
  if(!s.mediaServerUrl) s.mediaServerUrl = DEFAULT_MEDIA_URL;
  return s;
}
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? migrateState(JSON.parse(raw)) : clone(defaultState);
  }catch{
    return clone(defaultState);
  }
}
let state = loadState();

if(channel){
  channel.onmessage = (e)=>{
    if(e.data?.type === 'state'){
      state = migrateState(e.data.state);
      render();
    }
  };
}
window.addEventListener('storage', e=>{
  if(e.key === STORAGE_KEY && e.newValue){
    state = migrateState(JSON.parse(e.newValue));
    render();
  }
});

function saveState(broadcast=true){
  state.lastUpdated = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if(broadcast && channel) channel.postMessage({type:'state', state});
  render();
}
function ranking(){ return [...state.teams].sort((a,b)=>b.score-a.score); }
function totalPoints(){ return state.teams.reduce((a,t)=>a+Number(t.score||0),0); }

function addPoints(teamId, pts){
  const t = state.teams.find(x=>x.id===teamId);
  if(!t) return;
  t.score += Number(pts);
  state.history.unshift({
    id:randomId(),
    teamId,
    teamName:t.name,
    delta:Number(pts),
    question:state.questionLabel || '',
    ts:Date.now()
  });
  saveState();
}
function undoLast(){
  const item = state.history.shift();
  if(!item) return;
  const t = state.teams.find(x=>x.id===item.teamId);
  if(t) t.score -= Number(item.delta);
  saveState();
}
function removeHistoryItem(id){
  const idx = state.history.findIndex(h=>h.id===id);
  if(idx === -1) return;
  const item = state.history[idx];
  const t = state.teams.find(x=>x.id===item.teamId);
  if(t) t.score -= Number(item.delta);
  state.history.splice(idx,1);
  saveState();
}
function resetAll(){
  state.teams.forEach(t=>t.score=0);
  state.history = [];
  state.questionLabel = 'Question 1';
  saveState();
}
async function pingMedia(){
  const base = (state.mediaServerUrl || '').trim().replace(/\/$/, '');
  if(!base) return {ok:false, message:'Adresse manquante'};
  try{
    const res = await fetch(base + '/health');
    if(!res.ok) throw new Error();
    const data = await res.json();
    return {ok:true, message:'Connecté à ' + (data.host || 'Mac')};
  }catch{
    return {ok:false, message:'Bridge indisponible'};
  }
}
async function mediaCommand(action, value){
  const base = (state.mediaServerUrl || '').trim().replace(/\/$/, '');
  if(!base) return alert('Adresse du bridge manquante');
  try{
    const res = await fetch(base + '/command', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action, value})
    });
    const data = await res.json();
    if(!res.ok || !data.ok) throw new Error(data.message || 'Erreur');
    toast(data.message || 'Commande envoyée');
  }catch(err){
    alert('Commande QuickTime impossible : ' + (err.message || err));
  }
}
function toast(msg){
  const el = document.getElementById('toast');
  if(!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(()=>el.classList.add('hidden'), 1800);
}
function render(){
  const leader = ranking()[0];
  document.getElementById('app').innerHTML = `
    <div class="card hero">
      <div class="hero-top">
        <div>
          <h1>${esc(state.title)}</h1>
          <div class="sub">${esc(state.subtitle)}</div>
        </div>
        <div class="toolbar">
          <button class="btn ghost" id="undoBtn">Annuler</button>
          <button class="btn danger" id="resetBtn">Reset</button>
        </div>
      </div>
      <div class="row">
        <div>
          <label>Question affichée</label>
          <input id="questionInput" type="text" value="${esc(state.questionLabel)}">
        </div>
        <div>
          <label>Adresse bridge QuickTime</label>
          <input id="mediaUrlInput" type="text" value="${esc(state.mediaServerUrl)}">
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="kpis">
        <div class="kpi"><div class="label">Leader</div><div class="value">${leader ? esc(leader.name) : '—'}</div></div>
        <div class="kpi"><div class="label">Meilleur score</div><div class="value">${leader ? leader.score : 0}</div></div>
        <div class="kpi"><div class="label">Points distribués</div><div class="value">${totalPoints()}</div></div>
      </div>
    </div>

    <div class="panel">
      <h2>Scores</h2>
      <div class="team-grid">
        ${state.teams.map(team=>`
          <div class="card team-card">
            <div class="team-bar" style="background:${team.color}"></div>
            <div class="team-head">
              <div class="team-name">${esc(team.name)}</div>
              <div class="team-score">${team.score}</div>
            </div>
            <div class="points-grid">
              ${[-1,0.25,0.5,1,2].map(v=>`<button class="btn ${v>0?'primary':'ghost'} add-points-btn" data-team="${team.id}" data-points="${v}">${v>0?'+':''}${v}</button>`).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="panel">
      <h2>QuickTime</h2>
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
        <div id="mediaStatus" class="pill"><span class="dot"></span><span>État inconnu</span></div>
        <button class="btn ghost" id="testBridgeBtn">Tester bridge</button>
      </div>
      <div class="toolbar">
        <button class="btn primary media-btn" data-action="playpause">Lecture / pause</button>
        <button class="btn ghost media-btn" data-action="previous">Précédent</button>
        <button class="btn ghost media-btn" data-action="next">Suivant</button>
        <button class="btn ghost media-btn" data-action="mute">Mute</button>
        <button class="btn ghost media-btn" data-action="volume-down">Volume -</button>
        <button class="btn primary media-btn" data-action="volume-up">Volume +</button>
      </div>
    </div>

    <div class="panel">
      <h2>Historique</h2>
      <div class="log">
        ${state.history.length ? state.history.map(item=>`
          <div class="log-item">
            <div class="log-top"><span>${esc(item.teamName)}</span><span>${item.delta>0?'+':''}${item.delta}</span></div>
            <div class="log-meta">${esc(item.question || '')} • ${fmtDate(item.ts)}</div>
            <div style="margin-top:10px"><button class="btn ghost small remove-history-btn" data-id="${item.id}">Supprimer</button></div>
          </div>
        `).join('') : `<div class="log-item"><div class="log-meta">Aucun point enregistré.</div></div>`}
      </div>
    </div>

    <div class="sticky-bottom">
      <div class="bottom-bar">
        <button class="btn ghost" id="bottomUndoBtn">Annuler</button>
        <button class="btn primary" id="bottomPlayBtn">Play / Pause</button>
        <button class="btn warn" id="bottomPlusBtn">+1 rapide</button>
      </div>
    </div>

    <div id="toast" class="pill toast hidden"></div>
  `;
  bind();
  refreshMediaStatus();
}
function bind(){
  document.getElementById('questionInput')?.addEventListener('input', e=>{ state.questionLabel = e.target.value; saveState(); });
  document.getElementById('mediaUrlInput')?.addEventListener('change', e=>{ state.mediaServerUrl = e.target.value.trim(); saveState(); refreshMediaStatus(); });
  document.getElementById('undoBtn')?.addEventListener('click', undoLast);
  document.getElementById('bottomUndoBtn')?.addEventListener('click', undoLast);
  document.getElementById('resetBtn')?.addEventListener('click', ()=>confirm('Tout remettre à zéro ?') && resetAll());
  document.getElementById('testBridgeBtn')?.addEventListener('click', refreshMediaStatus);
  document.getElementById('bottomPlayBtn')?.addEventListener('click', ()=>mediaCommand('playpause'));
  document.getElementById('bottomPlusBtn')?.addEventListener('click', ()=>addPoints('merguez', 1));
  document.querySelectorAll('.add-points-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>addPoints(btn.dataset.team, Number(btn.dataset.points)));
  });
  document.querySelectorAll('.remove-history-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>removeHistoryItem(btn.dataset.id));
  });
  document.querySelectorAll('.media-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>mediaCommand(btn.dataset.action));
  });
}
async function refreshMediaStatus(){
  const el = document.getElementById('mediaStatus');
  if(!el) return;
  el.className = 'pill';
  el.innerHTML = '<span class="dot"></span><span>Test…</span>';
  const res = await pingMedia();
  el.className = 'pill ' + (res.ok ? 'ok' : 'bad');
  el.innerHTML = '<span class="dot"></span><span>' + esc(res.message) + '</span>';
}
render();
