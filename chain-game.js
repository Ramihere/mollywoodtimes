import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getDatabase, ref, get, set, update, remove, push, onValue, onChildAdded } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCWrsPhvAiZQVmsE-FHapKDTQaQt-i2Lf4",
  authDomain: "mollywood-times.firebaseapp.com",
  databaseURL: "https://mollywood-times-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "mollywood-times",
  storageBucket: "mollywood-times.firebasestorage.app",
  messagingSenderId: "533170680427",
  appId: "1:533170680427:web:75ddbc78598125785ab72e",
  measurementId: "G-H4ZY0B5MP8"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const $ = id => document.getElementById(id);
const state = { uid:null, code:null, isHost:false, myTeam:null, meta:null, players:{}, game:null, timer:null, timerBusy:false, requestQueue:Promise.resolve(), processed:new Set(), unsubscribers:[] };
const norm = s => String(s||"").normalize("NFC").replace(/[\u200B-\u200D\uFEFF]/g,"").replace(/\s+/g," ").trim();
const parts = s => window.Intl&&Intl.Segmenter ? [...new Intl.Segmenter("ml",{granularity:"grapheme"}).segment(s)].map(x=>x.segment) : [...s];
function letters(value){const s=norm(value).replace(/[\s.,!?'"“”‘’()\[\]{}:;—–-]+$/u,"");if(!s)return{first:"",last:""};if(!/[\u0D00-\u0D7F]/u.test(s)){const x=s.toLowerCase().replace(/[^a-z0-9]/g,"");return{first:x[0]||"",last:x[x.length-1]||""};}const a=parts(s).filter(x=>/[\u0D00-\u0D7F]/u.test(x));return{first:(a[0]||"").toLowerCase(),last:(a[a.length-1]||"").toLowerCase()};}
function say(msg,bad=false){$("status").textContent=msg||"";$("status").style.color=bad?"var(--danger)":"var(--orange)";}
function toast(msg){const el=$("toast");el.textContent=msg;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2800);}
function showGame(on){$("setup").classList.toggle("hidden",on);$("game").classList.toggle("hidden",!on);}
function gameRef(){return ref(db,"rooms/"+state.code+"/game");}
function playerTeam(uid){return state.players[uid]?.team;}
function myTurn(){return !!state.game && playerTeam(state.uid)===state.game.turn && !state.game.ended;}
function finishGame(g,meta,reason="limit"){
  g.ended=true;g.timerRunning=false;g.endReason=reason;
  const scores=g.scores||[0,0],names=meta.teamNames||["Team A","Team B"];
  const team=scores[0]===scores[1]?null:(scores[0]>scores[1]?0:1);
  const playerCounts={};
  (g.chain||[]).forEach(item=>{if(item.player&&(team===null||item.team===team))playerCounts[item.player]=(playerCounts[item.player]||0)+1;});
  const top=Object.entries(playerCounts).sort((a,b)=>b[1]-a[1])[0]||null;
  g.winner={team,teamName:team===null?null:names[team],topPlayer:top?top[0]:null,topPlayerMovies:top?top[1]:0,scores:[scores[0]||0,scores[1]||0],movieCount:(g.chain||[]).length};
  g.message=team===null?"Game finished in a tie!":names[team]+" wins the game!";
}
function render(){
  if(!state.game||!state.meta)return;
  const g=state.game,m=state.meta;
  $("roomCodeDisplay").textContent=state.code;
  $("teamALabel").textContent=m.teamNames?.[0]||"Team A";
  $("teamBLabel").textContent=m.teamNames?.[1]||"Team B";
  $("scoreA").textContent=g.scores?.[0]||0;$("scoreB").textContent=g.scores?.[1]||0;
  $("teamA").classList.toggle("active",g.turn===0&&!g.ended);$("teamB").classList.toggle("active",g.turn===1&&!g.ended);
  $("turnBanner").textContent=g.ended?(g.scores[0]===g.scores[1]?"It's a tie!":g.scores[0]>g.scores[1]?(m.teamNames?.[0]||"Team A")+" wins!":(m.teamNames?.[1]||"Team B")+" wins!"): "Now playing: "+(m.teamNames?.[g.turn]||("Team "+(g.turn===0?"A":"B")));
  const last=g.chain?.length?g.chain[g.chain.length-1].title:"";
  const req=last?letters(last).last:"";
  $("requiredLetter").textContent=req?req.toUpperCase():"—";
  $("requiredLabel").textContent=req?"Required starting letter":"First movie";
  $("movieInput").placeholder=req?("Start with “"+req.toUpperCase()+"”"):"e.g. Vettam";
  $("submitMovie").textContent=g.chain?.length?"Submit Movie →":"Start Chain →";
  $("submitMovie").disabled=!myTurn();
  $("movieInput").disabled=!myTurn();
  $("skipTurn").disabled=!myTurn();
  const latest=g.chain?.length?g.chain[g.chain.length-1]:null;
  const canReject=!!latest&&!g.ended&&playerTeam(state.uid)===g.turn&&latest.team!==g.turn;
  $("pendingPanel").classList.toggle("hidden",!canReject);
  if(canReject){
    $("pendingTitle").textContent=latest.title;
    $("pendingMeta").textContent=(m.teamNames?.[latest.team]||("Team "+(latest.team===0?"A":"B")))+" · "+(latest.player||"Player")+" submitted this movie. Reject it only if it is not a valid Malayalam movie.";
    $("rejectMovie").classList.remove("hidden");
    $("pendingWait").classList.add("hidden");
  }
  $("undoMovie").disabled=!state.isHost||!g.chain?.length||g.ended;
  $("endGame").disabled=!state.isHost||g.ended;
  $("timerToggle").disabled=!state.isHost||g.ended;
  $("timerToggle").textContent=g.timerRunning?"Pause Timer":"Start Timer";
  $("timerLabel").textContent=(g.remaining??m.seconds)+"s";
  $("timerFill").style.width=((g.remaining??m.seconds)/m.seconds*100)+"%";
  $("timerFill").classList.toggle("low",(g.remaining??m.seconds)<=8);
  const movieCount=g.chain?.length||0, target=Math.max(1,Number(m.movieLimit)||50), pct=Math.min(100,Math.round(movieCount/target*100));
  $("chainCount").textContent=movieCount;
  $("movieLimitDisplay").textContent=target;
  $("progressLabel").textContent=pct+"% complete";
  $("goalFill").style.width=pct+"%";
  $("winnerOverlay").classList.toggle("hidden",!g.ended);
  if(g.ended){
    const w=g.winner||null;
    $("winnerHeading").textContent=w?(w.team===null?"It's a Tie!":"We have a Winner!"):"Game Over";
    $("winnerTeam").textContent=w?(w.team===null?"Both teams finish level":w.teamName+" wins!"):(g.message||"Game ended");
    $("winnerPlayer").textContent=w&&w.topPlayer?"Top player: "+w.topPlayer+" · "+w.topPlayerMovies+" movies":"";
    $("winnerScore").textContent=w?(m.teamNames?.[0]||"Team A")+" "+w.scores[0]+" — "+w.scores[1]+" "+(m.teamNames?.[1]||"Team B"):"";
  }
  $("connectionState").textContent=(state.isHost?"Connected · Host":"Connected")+" · "+(playerTeam(state.uid)===0?(m.teamNames?.[0]||"Team A"):(m.teamNames?.[1]||"Team B"))+" · "+Object.values(state.players||{}).filter(p=>p.team===0).length+"/"+(m.teamSize||1)+" vs "+Object.values(state.players||{}).filter(p=>p.team===1).length+"/"+(m.teamSize||1);
  const players=Object.values(state.players||{});
  $("playersList").innerHTML="";
  if(!players.length){$("playersList").textContent="Waiting for players…";}
  else players.forEach(p=>{const line=document.createElement("div");line.className="player-chip";line.textContent=p.name+" · "+(m.teamNames?.[p.team]||("Team "+(p.team===0?"A":"B")))+(p.uid===m.hostUid?" · Host":"");$("playersList").appendChild(line);});
  const list=$("chainList");list.innerHTML="";
  if(!g.chain?.length){list.innerHTML='<div class="empty-chain">🎬 No movies yet.<br>Team A can start the chain!</div>';}
  else g.chain.forEach((item,i)=>{const row=document.createElement("div");row.className="chain-item";const n=document.createElement("span");n.className="chain-number";n.textContent=i+1;const info=document.createElement("div");const title=document.createElement("div");title.className="movie-title";title.textContent=item.title;const meta=document.createElement("div");meta.className="movie-meta";meta.textContent=(m.teamNames?.[item.team]||("Team "+(item.team===0?"A":"B")))+" · "+(item.player||"Player")+" · "+new Date(item.time||Date.now()).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});info.append(title,meta);const tag=document.createElement("span");tag.className="letter-tag";tag.textContent=letters(item.title).last.toUpperCase();row.append(n,info,tag);list.appendChild(row);});
  if(g.message)say(g.message);else say("");
}
function roomPath(path=""){return "rooms/"+state.code+(path?"/"+path:"");}
async function ensureAuth(){if(auth.currentUser)return auth.currentUser;const cred=await signInAnonymously(auth);return cred.user;}
function makeCode(){const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";const bytes=new Uint8Array(6);crypto.getRandomValues(bytes);return [...bytes].map(b=>chars[b%chars.length]).join("");}
async function createRoom(event){event.preventDefault();try{const user=await ensureAuth();const name=norm($("playerName").value);if(!name)throw new Error("Enter your display name first.");const teamNames=[norm($("nameA").value)||"Team A",norm($("nameB").value)||"Team B"];const format=$("matchFormat").value;const teamSize=format==="custom"?Math.max(1,Math.min(10,Number($("customTeamSize").value)||3)):Number(format);const seconds=Number($("duration").value)||30;const movieLimit=$("movieLimit").value==="custom"?Math.max(1,Math.min(500,Number($("customMovieLimit").value)||50)):Number($("movieLimit").value)||50;let code,created=false;for(let i=0;i<8;i++){code=makeCode();const existing=await get(ref(db,"rooms/"+code+"/meta"));if(!existing.exists()){created=true;break;}}if(!created)throw new Error("Could not create a room code. Please try again.");state.uid=user.uid;state.code=code;state.isHost=true;state.myTeam=0;state.meta={hostUid:user.uid,teamNames,seconds,teamSize,format,movieLimit,createdAt:Date.now()};state.players={[user.uid]:{uid:user.uid,name,team:0,joinedAt:Date.now()}};state.game={scores:[0,0],chain:[],turn:0,remaining:seconds,timerRunning:false,ended:false,movieLimit,winner:null,message:"Room created! Share the code with your friends. Team A plays first."};await set(ref(db,roomPath("meta")),state.meta);await set(ref(db,roomPath("players/"+user.uid)),state.players[user.uid]);await set(gameRef(),state.game);await enterRoom();}catch(e){console.error(e);toast(friendlyError(e));}}
async function joinRoom(event){event.preventDefault();try{const user=await ensureAuth();const code=norm($("roomCodeInput").value).toUpperCase().replace(/[^A-Z0-9]/g,"");const name=norm($("joinName").value);const team=Number($("joinTeam").value);if(!code)throw new Error("Enter the room code.");if(!name)throw new Error("Enter your display name.");const metaSnap=await get(ref(db,"rooms/"+code+"/meta"));if(!metaSnap.exists())throw new Error("Room not found. Check the code and try again.");const meta=metaSnap.val();const gameSnap=await get(ref(db,"rooms/"+code+"/game"));if(!gameSnap.exists())throw new Error("This room is not ready yet.");state.uid=user.uid;state.code=code;state.isHost=meta.hostUid===user.uid;state.myTeam=team;state.meta=meta;const playerSnap=await get(ref(db,"rooms/"+code+"/players"));const currentPlayers=playerSnap.val()||{};const teamCount=Object.values(currentPlayers).filter(p=>p.team===team).length;const teamSize=Number(meta.teamSize)||1;if(teamCount>=teamSize)throw new Error((meta.teamNames?.[team]||("Team "+(team===0?"A":"B")))+" is full. Choose the other team.");const player={uid:user.uid,name,team,joinedAt:Date.now()};await set(ref(db,"rooms/"+code+"/players/"+user.uid),player);state.players={};state.game=gameSnap.val();await enterRoom();}catch(e){console.error(e);toast(friendlyError(e));}}
function friendlyError(e){if(e?.code==="PERMISSION_DENIED"||String(e?.message||"").includes("PERMISSION_DENIED"))return "Firebase denied this action. Check the Realtime Database rules and confirm Anonymous Authentication is enabled.";if(e?.code==="auth/unauthorized-domain")return "Authorize ramihere.github.io in Firebase Authentication → Settings → Authorized domains.";if(e?.code==="auth/operation-not-allowed")return "Enable Anonymous sign-in in Firebase Authentication → Sign-in method.";return e?.message||"Something went wrong. Please try again.";}
async function enterRoom(){showGame(true);$("movieInput").value="";$("connectionState").textContent="Connecting…";const base=roomPath();state.unsubscribers.forEach(fn=>fn());state.unsubscribers=[];state.unsubscribers.push(onValue(ref(db,base+"/meta"),snap=>{if(!snap.exists()){toast("This room no longer exists.");return;}state.meta=snap.val();render();}));state.unsubscribers.push(onValue(ref(db,base+"/players"),snap=>{state.players=snap.val()||{};render();}));state.unsubscribers.push(onValue(ref(db,base+"/game"),snap=>{state.game=snap.val();render();}));if(state.isHost)startHostServices();else state.unsubscribers.push(onValue(ref(db,base+"/meta/hostUid"),snap=>{if(!snap.exists())toast("The host is no longer available.");}));}
function startHostServices(){const requestsRef=ref(db,roomPath("requests"));state.unsubscribers.push(onChildAdded(requestsRef,snap=>{const requestId=snap.key;const request=snap.val();if(!request||state.processed.has(requestId))return;state.processed.add(requestId);state.requestQueue=state.requestQueue.then(()=>processRequest(requestId,request)).catch(e=>{console.error(e);});}));if(state.timer)clearInterval(state.timer);state.timer=setInterval(()=>{if(state.timerBusy||!state.game?.timerRunning||state.game?.ended)return;state.timerBusy=true;state.requestQueue=state.requestQueue.then(async()=>{const snap=await get(gameRef());if(!snap.exists())return;const g=snap.val();if(!g.timerRunning||g.ended)return;g.remaining=Math.max(0,(g.remaining??state.meta.seconds)-1);if(g.remaining<=0){g.turn=1-g.turn;g.remaining=state.meta.seconds;g.message="Time is up! The turn has passed to the other team.";}await set(gameRef(),g);}).catch(console.error).finally(()=>{state.timerBusy=false;});},1000);}
async function processRequest(requestId,request){try{const reqRef=ref(db,roomPath("requests/"+requestId));const uid=request.uid;const playersSnap=await get(ref(db,roomPath("players")));const players=playersSnap.val()||{};const player=players[uid];const meta=state.meta||(await get(ref(db,roomPath("meta")))).val();const gameSnap=await get(gameRef());if(!gameSnap.exists())return;const g=gameSnap.val();if(!player)return;
if(request.action==="move"){if(g.ended||player.team!==g.turn){g.message="Move not accepted: it is not your team's turn. The first valid submission wins the turn.";await set(gameRef(),g);return;}const title=norm(request.title);if(!title){g.message="Enter a movie title.";await set(gameRef(),g);return;}const key=title.toLocaleLowerCase().replace(/\s+/g," ");if((g.usedTitles||[]).includes(key)){g.message="That movie has already been used. Try another title.";await set(gameRef(),g);return;}const ch=letters(title);const last=g.chain?.length?letters(g.chain[g.chain.length-1].title).last:"";if(!ch.first||!ch.last||(last&&ch.first!==last)){g.message=last?"That title must start with “"+last.toUpperCase()+"”.":"Please enter a readable movie title.";await set(gameRef(),g);return;}g.chain=g.chain||[];g.usedTitles=g.usedTitles||[];g.chain.push({title,team:player.team,player:player.name,time:Date.now()});g.usedTitles.push(key);g.scores[player.team]++;g.turn=1-player.team;g.remaining=meta.seconds;const target=Math.max(1,Number(meta.movieLimit)||50);g.message=title+" submitted by "+player.name+". "+g.chain.length+"/"+target+" movies completed.";if(g.chain.length>=target){finishGame(g,meta,"limit");}await set(gameRef(),g);return;}
if(request.action==="reject"){const latest=g.chain?.length?g.chain[g.chain.length-1]:null;if(g.ended||!latest||player.team!==g.turn||latest.team===player.team){g.message="Only the team whose turn it is can reject the opponent's latest movie.";await set(gameRef(),g);return;}g.chain.pop();const key=latest.title.toLocaleLowerCase().replace(/\s+/g," ");g.usedTitles=(g.usedTitles||[]).filter(x=>x!==key);g.scores[latest.team]=Math.max(0,(g.scores[latest.team]||0)-1);g.turn=player.team;g.remaining=meta.seconds;g.message="Rejected “"+latest.title+"”. No point awarded. "+(meta.teamNames?.[player.team]||("Team "+(player.team===0?"A":"B")))+" keeps the turn and can submit a replacement.";await set(gameRef(),g);return;}
if(request.action==="skip"){if(g.ended||g.pending||player.team!==g.turn){g.message="Only the team whose turn it is can skip.";await set(gameRef(),g);return;}g.turn=1-g.turn;g.remaining=meta.seconds;g.message=player.name+" skipped the turn. No point awarded.";await set(gameRef(),g);return;}
if(request.action==="undo"&&uid===meta.hostUid){if(g.ended||!g.chain?.length)return;const item=g.chain.pop();g.usedTitles=(g.usedTitles||[]).filter(x=>x!==item.title.toLocaleLowerCase().replace(/\s+/g," "));g.scores[item.team]=Math.max(0,g.scores[item.team]-1);g.turn=item.team;g.remaining=meta.seconds;g.message="Removed “"+item.title+"” from the chain.";await set(gameRef(),g);return;}
if(request.action==="end"&&uid===meta.hostUid){finishGame(g,meta,"host");g.message="Game ended by the host.";await set(gameRef(),g);return;}
if(request.action==="timer"&&uid===meta.hostUid&&!g.ended){g.timerRunning=!g.timerRunning;g.message=g.timerRunning?"The countdown timer is running.":"The countdown timer is paused.";await set(gameRef(),g);return;}
}finally{await remove(ref(db,roomPath("requests/"+requestId)));}}
async function sendAction(action,extra={}){if(!state.code||!state.uid)return;try{await push(ref(db,roomPath("requests")),{uid:state.uid,action,...extra,createdAt:Date.now()});}catch(e){toast(friendlyError(e));}}
$("setupForm").addEventListener("submit",createRoom);
$("joinRoomForm").addEventListener("submit",joinRoom);
$("movieForm").addEventListener("submit",e=>{e.preventDefault();const title=norm($("movieInput").value);if(!title){say("Enter a movie title.",true);return;}sendAction("move",{title});$("movieInput").value="";});
$("skipTurn").addEventListener("click",()=>sendAction("skip"));
$("rejectMovie").addEventListener("click",()=>sendAction("reject"));
$("undoMovie").addEventListener("click",()=>sendAction("undo"));
$("endGame").addEventListener("click",()=>sendAction("end"));
$("timerToggle").addEventListener("click",()=>sendAction("timer"));
$("winnerLeave").addEventListener("click",()=>$("leaveRoom").click());
$("copyRoom").addEventListener("click",async()=>{const link=location.origin+location.pathname+"?room="+encodeURIComponent(state.code);try{await navigator.clipboard.writeText(link);toast("Invite link copied! Room code: "+state.code);}catch{toast("Share this link: "+link+" — Room code: "+state.code);}});
$("leaveRoom").addEventListener("click",async()=>{if(state.code&&state.uid){try{await remove(ref(db,roomPath("players/"+state.uid)));}catch(e){console.warn(e);}}if(state.timer)clearInterval(state.timer);state.unsubscribers.forEach(fn=>fn());state.unsubscribers=[];state.code=null;state.game=null;state.meta=null;state.players={};state.isHost=false;showGame(false);});
$("helpBtn").addEventListener("click",()=>$("helpDialog").showModal());
$("closeHelp").addEventListener("click",()=>$("helpDialog").close());
const roomFromUrl=new URLSearchParams(location.search).get("room");if(roomFromUrl){$("roomCodeInput").value=roomFromUrl.toUpperCase();$("joinName").focus({preventScroll:true});}
onAuthStateChanged(auth,user=>{if(user)state.uid=user.uid;});
renderSetupDefaults();
function renderSetupDefaults(){$("connectionState").textContent="Not connected";$("matchFormat").addEventListener("change",()=>{$("customSizeWrap").classList.toggle("hidden",$("matchFormat").value!=="custom");});$("movieLimit").addEventListener("change",()=>{$("customMovieLimitWrap").classList.toggle("hidden",$("movieLimit").value!=="custom");});}