import {useState,useEffect,useCallback} from 'react'
import {sb} from './supabase'

const COLORS=['#9aa8ff','#6fd3b5','#f2b76b','#f08fa3','#7cc4f5','#c59cf2','#b8d96b']
const day=d=>new Date(d).toLocaleDateString('en-CA')
const hm=s=>{s=Math.max(0,Math.round(s));const h=Math.floor(s/3600),m=Math.floor(s%3600/60);return h?`${h}h ${m}m`:`${m}m`}
const clock=s=>{s=Math.max(0,Math.floor(s));const p=n=>String(n).padStart(2,'0');return `${p(Math.floor(s/3600))}:${p(Math.floor(s%3600/60))}:${p(s%60)}`}
const subColor=(subs,n)=>subs.find(s=>s.name===n)?.color||'#6b7482'

function Login(){
  const [email,setEmail]=useState(''),[msg,setMsg]=useState('')
  const go=async e=>{e.preventDefault();setMsg('Sending…')
    const {error}=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin}})
    setMsg(error?error.message:'Check your email for the sign-in link.')}
  return <main className="login"><form className="card" onSubmit={go}>
    <h1>Focal</h1><p className="muted">Track your study time and tasks on every device.</p>
    <input type="email" required placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)}/>
    <button className="btn primary">Email me a sign-in link</button>{msg&&<p className="muted">{msg}</p>}
  </form></main>
}

export default function App(){
  const [user,setUser]=useState(undefined)
  useEffect(()=>{sb.auth.getSession().then(({data})=>setUser(data.session?.user||null))
    const {data}=sb.auth.onAuthStateChange((_,s)=>setUser(s?.user||null));return()=>data.subscription.unsubscribe()},[])
  if(user===undefined)return <div className="login muted">Loading…</div>
  return user?<Main user={user}/>:<Login/>
}

function Main({user}){
  const [tab,setTab]=useState('dash')
  const [subs,setSubs]=useState([]),[sessions,setSessions]=useState([]),[tasks,setTasks]=useState([]),[active,setActive]=useState(null)
  const [now,setNow]=useState(Date.now()),[pick,setPick]=useState(''),[err,setErr]=useState('')
  const uid=user.id
  const load=useCallback(async()=>{
    const since=new Date(Date.now()-14*864e5).toISOString()
    const [a,b,c,d]=await Promise.all([
      sb.from('subjects').select('*').order('created_at'),
      sb.from('sessions').select('*').gte('started_at',since),
      sb.from('tasks').select('*').order('created_at',{ascending:false}),
      sb.from('active_timer').select('*').maybeSingle()])
    const e=a.error||b.error||c.error||d.error
    if(e)setErr(e.message);else setErr('')
    setSubs(a.data||[]);setSessions(b.data||[]);setTasks(c.data||[]);setActive(d.data)
  },[])
  useEffect(()=>{load()
    const t=setInterval(()=>setNow(Date.now()),1000)
    const v=()=>document.visibilityState==='visible'&&load()
    document.addEventListener('visibilitychange',v)
    return()=>{clearInterval(t);document.removeEventListener('visibilitychange',v)}},[load])
  useEffect(()=>{if(!pick&&subs[0])setPick(subs[0].name)},[subs,pick])

  const elapsed=active?active.acc+(active.running?(now-new Date(active.started_at))/1e3:0):0
  const run=async p=>{const {data,error}=await p;if(error)setErr(error.message);return data}
  const start=async()=>{if(!pick)return;setActive(await run(sb.from('active_timer').upsert({user_id:uid,subject:pick,acc:0,running:true,started_at:new Date().toISOString()}).select().single()))}
  const pause=async()=>setActive(await run(sb.from('active_timer').update({acc:elapsed,running:false}).eq('user_id',uid).select().single()))
  const resume=async()=>setActive(await run(sb.from('active_timer').update({running:true,started_at:new Date().toISOString()}).eq('user_id',uid).select().single()))
  const stop=async()=>{const s=Math.round(elapsed)
    if(s>=5){const r=await run(sb.from('sessions').insert({user_id:uid,subject:active.subject,seconds:s,started_at:new Date(Date.now()-s*1e3).toISOString()}).select().single());if(r)setSessions(x=>[...x,r])}
    await run(sb.from('active_timer').delete().eq('user_id',uid));setActive(null)}
  const addSub=async name=>{name=name.trim();if(!name)return
    const r=await run(sb.from('subjects').insert({user_id:uid,name,color:COLORS[subs.length%COLORS.length]}).select().single());if(r){setSubs(x=>[...x,r]);if(!pick)setPick(r.name)}}

  const today=day(now)
  const todays=sessions.filter(s=>day(s.started_at)===today)
  const bySub={};todays.forEach(s=>bySub[s.subject]=(bySub[s.subject]||0)+s.seconds)
  if(active)bySub[active.subject]=(bySub[active.subject]||0)+elapsed
  const total=Object.values(bySub).reduce((a,b)=>a+b,0)
  const week=[...Array(7)].map((_,i)=>{const d=day(now-(6-i)*864e5)
    const t=sessions.filter(s=>day(s.started_at)===d).reduce((a,s)=>a+s.seconds,0)+(d===today&&active?elapsed:0)
    return {d,t,label:new Date(d+'T12:00').toLocaleDateString(undefined,{weekday:'short'})}})
  const weekTotal=week.reduce((a,w)=>a+w.t,0),maxDay=Math.max(...week.map(w=>w.t),1)
  const dueToday=tasks.filter(t=>!t.done&&(!t.deadline||t.deadline<=today))
  const done=tasks.filter(t=>t.done).length

  const Timer=<section className="card timer">
    <h2>Study timer</h2>
    {!active?<>
      <div className="clock">00:00:00</div>
      <select value={pick} onChange={e=>setPick(e.target.value)} aria-label="Subject">
        {subs.length===0&&<option value="">Add a subject first</option>}{subs.map(s=><option key={s.id}>{s.name}</option>)}</select>
      <button className="btn primary big" disabled={!pick} onClick={start}>Start studying</button>
      <AddSub onAdd={addSub}/></>:<>
      <div className={'clock'+(active.running?' live':'')} style={{'--c':subColor(subs,active.subject)}}>{clock(elapsed)}</div>
      <p className="muted"><i className="dot" style={{background:subColor(subs,active.subject)}}/>{active.subject}{active.running?'':' · paused'}</p>
      <div className="row">{active.running?<button className="btn" onClick={pause}>Pause</button>:<button className="btn primary" onClick={resume}>Resume</button>}
        <button className="btn danger" onClick={stop}>Stop &amp; save</button></div></>}
  </section>

  const Subjects=<section className="card"><h2>Today by subject</h2>
    {Object.keys(bySub).length===0?<p className="muted">No study time yet today. Start the timer to log your first session.</p>:
      Object.entries(bySub).sort((a,b)=>b[1]-a[1]).map(([n,s])=><div className="bar-row" key={n}>
        <span><i className="dot" style={{background:subColor(subs,n)}}/>{n}</span><b>{hm(s)}</b>
        <div className="track"><div style={{width:s/total*100+'%',background:subColor(subs,n)}}/></div></div>)}
  </section>

  const Week=<section className="card"><h2>Last 7 days</h2>
    <div className="week">{week.map(w=><div key={w.d} className={w.d===today?'today':''}>
      <div className="col"><div style={{height:Math.max(w.t/maxDay*100,w.t?4:0)+'%'}}/></div><small>{w.label}</small><small className="muted">{w.t?hm(w.t):'–'}</small></div>)}</div>
    <p className="muted">Total {hm(weekTotal)} · daily average {hm(weekTotal/7)}</p></section>

  const TaskCard=<Tasks {...{tasks,subs,today,uid,setTasks,run}}/>

  return <div className="app">
    <nav><b className="brand">Focal</b>
      {[['dash','Dashboard'],['timer','Timer'],['tasks','Tasks'],['stats','Stats']].map(([k,l])=>
        <button key={k} className={tab===k?'on':''} onClick={()=>setTab(k)}>{l}</button>)}
      <button className="out" onClick={()=>sb.auth.signOut()}>Sign out</button></nav>
    <main>{err&&<p className="err">{err}</p>}
      {tab==='dash'&&<div className="grid">
        <div className="stats">
          <div className="card"><small className="muted">Studied today</small><div className="big-n">{hm(total)}</div></div>
          <div className="card"><small className="muted">Now studying</small><div className="big-n sm">{active?active.subject:'Nothing'}</div><small className="muted">{active?(active.running?clock(elapsed):'Paused'):'Timer is idle'}</small></div>
          <div className="card"><small className="muted">Tasks done</small><div className="big-n">{done}<span className="muted">/{tasks.length}</span></div>
            <div className="track"><div style={{width:(tasks.length?done/tasks.length*100:0)+'%'}}/></div></div></div>
        {Timer}{Subjects}
        <section className="card"><h2>Today's tasks</h2>{dueToday.length===0?<p className="muted">Nothing due today.</p>:dueToday.slice(0,6).map(t=><div className="task" key={t.id}>
          <input type="checkbox" onChange={async()=>{setTasks(x=>x.map(y=>y.id===t.id?{...y,done:true}:y));await run(sb.from('tasks').update({done:true}).eq('id',t.id))}}/>
          <span>{t.title}</span>{t.subject&&<small className="muted">{t.subject}</small>}</div>)}</section>
        {Week}</div>}
      {tab==='timer'&&<div className="grid one">{Timer}{Subjects}</div>}
      {tab==='tasks'&&<div className="grid one">{TaskCard}</div>}
      {tab==='stats'&&<div className="grid">{Week}<section className="card"><h2>This week by subject</h2>{(()=>{
        const ws=new Set(week.map(w=>w.d)),m={};sessions.filter(s=>ws.has(day(s.started_at))).forEach(s=>m[s.subject]=(m[s.subject]||0)+s.seconds)
        const e=Object.entries(m).sort((a,b)=>b[1]-a[1]);return e.length?e.map(([n,s])=><div className="bar-row" key={n}><span><i className="dot" style={{background:subColor(subs,n)}}/>{n}</span><b>{hm(s)}</b>
          <div className="track"><div style={{width:s/e[0][1]*100+'%',background:subColor(subs,n)}}/></div></div>):<p className="muted">No sessions this week.</p>})()}</section></div>}
    </main></div>
}

function AddSub({onAdd}){
  const [v,setV]=useState('')
  return <form className="row add" onSubmit={e=>{e.preventDefault();onAdd(v);setV('')}}>
    <input placeholder="New subject" maxLength={40} value={v} onChange={e=>setV(e.target.value)}/><button className="btn">Add</button></form>
}

function Tasks({tasks,subs,today,uid,setTasks,run}){
  const [f,setF]=useState({title:'',subject:'',deadline:''}),[edit,setEdit]=useState(null)
  const add=async e=>{e.preventDefault();if(!f.title.trim())return
    const r=await run(sb.from('tasks').insert({user_id:uid,title:f.title.trim(),subject:f.subject||null,deadline:f.deadline||null}).select().single())
    if(r){setTasks(x=>[r,...x]);setF({title:'',subject:'',deadline:''})}}
  const upd=async(id,p)=>{setTasks(x=>x.map(t=>t.id===id?{...t,...p}:t));await run(sb.from('tasks').update(p).eq('id',id))}
  const del=async id=>{setTasks(x=>x.filter(t=>t.id!==id));await run(sb.from('tasks').delete().eq('id',id))}
  const left=tasks.filter(t=>!t.done),dn=tasks.filter(t=>t.done)
  const Item=t=><div className={'task'+(t.done?' done':'')} key={t.id}>
    <input type="checkbox" checked={t.done} onChange={()=>upd(t.id,{done:!t.done})} aria-label="Complete"/>
    {edit?.id===t.id?<form className="row grow" onSubmit={e=>{e.preventDefault();upd(t.id,{title:edit.title});setEdit(null)}}>
      <input autoFocus value={edit.title} onChange={e=>setEdit({id:t.id,title:e.target.value})}/><button className="btn">Save</button></form>:
      <><span className="grow">{t.title}</span>{t.subject&&<small className="muted">{t.subject}</small>}
        {t.deadline&&<small className={!t.done&&t.deadline<today?'late':'muted'}>{t.deadline}</small>}
        <button className="ghost" onClick={()=>setEdit({id:t.id,title:t.title})}>Edit</button>
        <button className="ghost" onClick={()=>del(t.id)}>Delete</button></>}</div>
  return <section className="card"><h2>Tasks <small className="muted">{dn.length} done · {left.length} remaining</small></h2>
    <div className="track"><div style={{width:(tasks.length?dn.length/tasks.length*100:0)+'%'}}/></div>
    <form className="add-task" onSubmit={add}>
      <input placeholder="What needs doing?" maxLength={200} value={f.title} onChange={e=>setF({...f,title:e.target.value})}/>
      <select value={f.subject} onChange={e=>setF({...f,subject:e.target.value})}><option value="">No subject</option>{subs.map(s=><option key={s.id}>{s.name}</option>)}</select>
      <input type="date" value={f.deadline} onChange={e=>setF({...f,deadline:e.target.value})} aria-label="Deadline"/>
      <button className="btn primary">Add task</button></form>
    {left.length===0&&dn.length===0&&<p className="muted">No tasks yet. Add your first one above.</p>}
    {left.map(Item)}{dn.length>0&&<><h3>Completed</h3>{dn.map(Item)}</>}</section>
}
