(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const MALAYALAM = [..."അആഇഈഉഊഋൠഌൡഎഏഐഒഓഔകഖഗഘങചഛജഝഞടഠഡഢണതഥദധനപഫബഭമയരലവശഷസഹളഴറ"];
  const SIGNS = [..."ാിീുൂൃൄൢൣെേൈൊോൌംഃ്ൺൻർൽൾൿ"];
  const ALPHABET = [...new Set([...MALAYALAM, ...SIGNS])];
  const $lobby = $("lobby"), $waiting = $("waiting"), $game = $("game");
  let selectedMode = "1v1", localMode = true, db = null, auth = null, uid = "local-"+Math.random().toString(36).slice(2);
  let roomCode = "", roomRef = null, roomData = null, unsubscribe = null, myName = "", toastTimer = null;
  let localPlayers = [], localState = null, isHost = false, localHostAnswer = "", draftAnswer = "";
  const normalize = s => (s || "").normalize("NFC").replace(/\s+/g," ").trim();
  const graphemes = s => {
    if (window.Intl && Intl.Segmenter) return [...new Intl.Segmenter("ml",{granularity:"grapheme"}).segment(s)].map(x=>x.segment);
    return [...s];
  };
  const show = el => el.classList.remove("hidden"), hide = el => el.classList.add("hidden");
  const say = (id, msg) => { $(id).textContent = msg || ""; };
  function toast(msg) {
    const t=$("toast"); t.textContent=msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove("show"),2600);
  }
  function setScreen(which) { [$lobby,$waiting,$game].forEach(hide); show(which); window.scrollTo({top:0,behavior:"smooth"}); }
  function configFirebase() {
    const cfg=window.FIREBASE_GAME_CONFIG;
    if (!cfg?.configured || !window.firebase || !cfg.config?.apiKey || cfg.config.apiKey.startsWith("PASTE_")) return false;
    try {
      if (!firebase.apps.length) firebase.initializeApp(cfg.config);
      auth=firebase.auth(); db=firebase.database();
      $("connectionBadge").textContent="ഓൺലൈൻ മൾട്ടിപ്ലെയർ";
      $("connectionBadge").classList.add("online");
      return true;
    } catch(e) { console.error(e); return false; }
  }
  const firebaseReady=configFirebase();
  function freshRoom(code, mode, host) {
    return { code, mode, hostUid:host.uid, hostName:host.name, status:"waiting", createdAt:Date.now(),
      players:{[host.uid]:{uid:host.uid,name:host.name,team:0,joinedAt:Date.now()}},
      round:1, scores:{0:0,1:0}, puzzle:null, guesses:{}, wrong:0, finished:false, winner:null };
  }
  function roomCapacity() { return selectedMode==="2v2" ? 4 : 2; }
  function currentPlayers() { return roomData?.players ? Object.values(roomData.players) : localPlayers; }
  function myPlayer() { return currentPlayers().find(p=>p.uid===uid) || null; }
  function isMyTurnToGuess() { const p=myPlayer(); return !!p && !!roomData?.puzzle && !roomData.finished && (localMode || p.team !== roomData.puzzle.creatorTeam); }
  function renderPlayers() {
    const list=$("playersList"); list.innerHTML="";
    const players=currentPlayers(), max=roomData?.mode==="2v2"?4:2;
    players.forEach(p=>{
      const div=document.createElement("div"); div.className="player-chip";
      div.innerHTML=`<span class="player-avatar">${escapeHTML(graphemes(p.name)[0]||"ക")}</span><div><b>${escapeHTML(p.name)}</b><small>ടീം ${p.team===0?"A":"B"}${p.uid===roomData?.hostUid?" · ഹോസ്റ്റ്":""}</small></div>`;
      list.appendChild(div);
    });
    for(let i=players.length;i<max;i++){const div=document.createElement("div");div.className="player-chip";div.innerHTML='<span class="player-avatar">＋</span><div><b>കളിക്കാരനെ കാത്തിരിക്കുന്നു</b><small>ഇനിയും ചേരാം</small></div>';list.appendChild(div);}
    $("startGame").disabled=players.length<max;
    say("waitingMessage",players.length<max?`${max-players.length} കളിക്കാർ കൂടി ചേരണം.`:"എല്ലാവരും തയ്യാറാണ്! ഹോസ്റ്റ് കളി തുടങ്ങാം.");
  }
  function escapeHTML(s) { return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function makeCode(){return Math.random().toString(36).slice(2,7).toUpperCase().replace(/[0O1I]/g,"K");}
  async function createRoom() {
    myName=normalize($("playerName").value)||"കളിക്കാരൻ";
    if(firebaseReady) {
      try {
        const cred=await auth.signInAnonymously(); uid=cred.user.uid; localMode=false; isHost=true;
        selectedMode=document.querySelector(".mode-choice.selected").dataset.mode;
        roomCode=makeCode(); roomRef=db.ref("rooms/"+roomCode);
        const host={uid,name:myName};
        await roomRef.set(freshRoom(roomCode,selectedMode,host));
        await db.ref("roomSecrets/"+roomCode).set({answer:"",hint:""});
        listenRoom(); $("roomCodeDisplay").innerHTML=`${roomCode} <span>▢</span>`;
        $("gameRoomCode").textContent=roomCode; setScreen($waiting); return;
      } catch(e) { console.error(e); toast("ഓൺലൈൻ മുറി ഉണ്ടാക്കാനായില്ല. Firebase ക്രമീകരണം പരിശോധിക്കൂ."); return; }
    }
    localMode=true; isHost=true; roomCode=makeCode();
    const host={uid,name:myName,team:0};
    localPlayers=[host,{uid:"demo-guest",name:"സുഹൃത്ത് (ഡെമോ)",team:1}];
    localState=freshRoom(roomCode,selectedMode,host); localState.players={"local-host":host,"demo-guest":localPlayers[1]}; localState.hostUid="local-host"; uid="local-host";
    roomData=localState; $("roomCodeDisplay").innerHTML=`${roomCode} <span>▢</span>`; $("gameRoomCode").textContent=roomCode;
    setScreen($waiting); renderPlayers();
    say("waitingMessage","ഡെമോ മോഡ്: ഈ ബ്രൗസറിൽ മാത്രം പ്രവർത്തിക്കും. ഓൺലൈൻ കളിക്ക് Firebase ക്രമീകരിക്കൂ.");
  }
  async function joinRoom() {
    myName=normalize($("playerName").value)||"കളിക്കാരൻ";
    roomCode=normalize($("roomCode").value).toUpperCase();
    if(roomCode.length<4){say("lobbyMessage","ശരിയായ മുറിയുടെ കോഡ് നൽകൂ.");return;}
    if(!firebaseReady){say("lobbyMessage","ഓൺലൈൻ മുറിയിൽ ചേരാൻ Firebase ക്രമീകരിക്കണം. ഇപ്പോൾ ഡെമോ മുറികൾ ഈ ബ്രൗസറിൽ മാത്രം ലഭ്യമാണ്.");return;}
    try {
      const cred=await auth.signInAnonymously(); uid=cred.user.uid; localMode=false;
      roomRef=db.ref("rooms/"+roomCode);
      const snap=await roomRef.once("value");
      if(!snap.exists()){say("lobbyMessage","ഈ കോഡിൽ മുറി കണ്ടെത്തിയില്ല.");return;}
      const r=snap.val(), players=Object.values(r.players||{}), max=r.mode==="2v2"?4:2;
      if(r.status!=="waiting"){say("lobbyMessage","ഈ കളി ഇതിനകം തുടങ്ങിയിട്ടുണ്ട്.");return;}
      if(players.length>=max){say("lobbyMessage","മുറി നിറഞ്ഞു.");return;}
      const team=players.filter(p=>p.team===0).length < (r.mode==="2v2"?2:1) ? 0:1;
      await roomRef.child("players/"+uid).set({uid,name:myName,team,joinedAt:Date.now()});
      isHost=false; listenRoom(); $("gameRoomCode").textContent=roomCode; setScreen($waiting);
    } catch(e){console.error(e);say("lobbyMessage","മുറിയിൽ ചേരാനായില്ല. കോഡും Firebase rules-ഉം പരിശോധിക്കൂ.");}
  }
  function listenRoom() {
    if(unsubscribe) unsubscribe();
    if(!roomRef) return;
    const cb=roomRef.on("value",snap=>{
      if(!snap.exists()){toast("മുറി അവസാനിച്ചു.");returnToLobby();return;}
      roomData=snap.val(); $("gameRoomCode").textContent=roomCode; $("roomCodeDisplay").innerHTML=`${roomCode} <span>▢</span>`;
      if(roomData.status==="waiting"){setScreen($waiting);renderPlayers();}
      else {setScreen($game);renderGame();}
    });
    let requestRef = null, requestCb = null;
    if (isHost) {
      requestRef = roomRef.child("guessRequests");
      requestCb = requestRef.on("child_added", async snap => {
        const request = snap.val();
        if (!request || !request.letter) return;
        await snap.ref.remove();
        await hostProcessGuess(request.letter, Number.isInteger(request.index) ? request.index : null);
      });
    }
    unsubscribe=()=>{roomRef.off("value",cb); if(requestRef && requestCb) requestRef.off("child_added",requestCb);};
  }
  async function updateRoom(patch) {
    if(localMode){Object.assign(localState,patch);roomData=localState;renderGame();return;}
    await roomRef.update(patch);
  }
  async function startGame() {
    if(!isHost){toast("ഹോസ്റ്റിന് മാത്രമേ കളി തുടങ്ങാനാകൂ.");return;}
    const players=currentPlayers(), max=roomData.mode==="2v2"?4:2;
    if(players.length<max){toast("എല്ലാ കളിക്കാരും ചേരട്ടെ.");return;}
    await updateRoom({status:"playing",round:1,scores:{0:0,1:0},puzzle:null,guesses:{},placements:{},wrong:0,finished:false,winner:null});
    setScreen($game);
    renderGame();
  }
  function renderGame() {
    if(!roomData)return;
    const players=currentPlayers(), p=myPlayer(), puzzle=roomData.puzzle;
    $("roundNumber").textContent=roomData.round||1;
    $("score0").textContent=(roomData.scores||{})[0]||0; $("score1").textContent=(roomData.scores||{})[1]||0;
    $("team0Names").textContent=players.filter(x=>x.team===0).map(x=>x.name).join(", ")||"കളിക്കാർ";
    $("team1Names").textContent=players.filter(x=>x.team===1).map(x=>x.name).join(", ")||"കളിക്കാർ";
    $("team0Card").classList.toggle("active",p&&p.team===0); $("team1Card").classList.toggle("active",p&&p.team===1);
    $("roundTitle").textContent=roomData.finished?"റൗണ്ട് അവസാനിച്ചു":`റൗണ്ട് ${roomData.round||1}`;
    $("creatorTools").classList.toggle("hidden",!!puzzle||!isHost);
    if (!puzzle && isHost) renderCreatorBuilder();
    $("nextRound").classList.toggle("hidden",!roomData.finished||!isHost);
    $("hintBtn").disabled=!puzzle||!puzzle.hint||!isMyTurnToGuess();
    if(!puzzle){
      $("turnBanner").textContent=isHost?"നിങ്ങളുടെ ടീം സിനിമയുടെ പേര് തയ്യാറാക്കൂ.":"ഹോസ്റ്റ് ചോദ്യം തയ്യാറാക്കുകയാണ്…";
      $("wordSlots").innerHTML=""; $("alphabetTray").innerHTML="";
      say("gameMessage",isHost?"മലയാളത്തിൽ സിനിമയുടെ പേര് നൽകൂ. ഉത്തരം മറച്ചുവെക്കും.":"ചോദ്യം വരുന്നതുവരെ കാത്തിരിക്കൂ.");
      return;
    }
    const creatorTeam=puzzle.creatorTeam, guessingTeam=1-creatorTeam;
    $("turnBanner").textContent=p?.team===creatorTeam?"നിങ്ങളുടെ ടീമാണ് ചോദ്യം ഒരുക്കിയത്. മറുവശം ഊഹിക്കട്ടെ.":`ടീം ${guessingTeam===0?"A":"B"} ഊഹിക്കുന്നു — അക്ഷരങ്ങൾ തിരഞ്ഞെടുക്കൂ!`;
    $("mistakesLabel").innerHTML=`തെറ്റുകൾ <b>${roomData.wrong||0}</b>/5`;
    const answer=localHostAnswer;
    const answerChars=graphemes(answer||puzzle.mask||"");
    const guessed=roomData.guesses||{}, placements=roomData.placements||{};
    // The host publishes only the masked/revealed puzzle, never the full answer.
    const shown=graphemes(puzzle.mask||answer||"");
    const slots=$("wordSlots"); slots.innerHTML="";
    shown.forEach((ch,index)=>{
      const span=document.createElement("span");
      if(ch===" "){span.className="letter-slot space";span.textContent="";}
      else if(/[.,!?'":\\-]/u.test(ch)){span.className="letter-slot punctuation";span.textContent=ch;}
      else {
        const revealed=ch!=="_", placed=placements[index]||"";
        span.className="letter-slot"+(revealed?" revealed":placed?" placed":"");
        span.textContent=revealed?ch:placed;
        if (!revealed && isMyTurnToGuess() && !roomData.finished) {
          span.ondragover=e=>{e.preventDefault();span.classList.add("drag-over");};
          span.ondragleave=()=>span.classList.remove("drag-over");
          span.ondrop=e=>{e.preventDefault();e.stopPropagation();span.classList.remove("drag-over");const tile=e.dataTransfer.getData("text/plain");if(tile)guessLetter(tile,index);};
        }
      }
      slots.appendChild(span);
    });
    const tray=$("alphabetTray");tray.innerHTML="";
    ALPHABET.forEach(ch=>{
      const b=document.createElement("button");b.type="button";b.className="letter-tile";
      b.textContent=ch;b.draggable=isMyTurnToGuess()&&!roomData.finished;
      b.disabled=!isMyTurnToGuess()||roomData.finished;
      b.setAttribute("aria-label",`അക്ഷരം ${ch}`);
      b.addEventListener("click",()=>guessLetter(ch,null));
      b.addEventListener("dragstart",e=>{e.dataTransfer.setData("text/plain",ch);e.dataTransfer.effectAllowed="copy";});
      tray.appendChild(b);
    });
    slots.ondragover=e=>{if(isMyTurnToGuess()&&!roomData.finished){e.preventDefault();slots.classList.add("drag-over");}};
    slots.ondragleave=()=>slots.classList.remove("drag-over");
    slots.ondrop=e=>{e.preventDefault();slots.classList.remove("drag-over");const ch=e.dataTransfer.getData("text/plain");if(ch)guessLetter(ch,null);};
    if(roomData.finished) say("gameMessage",roomData.winner===null?"റൗണ്ട് അവസാനിച്ചു.":`ടീം ${roomData.winner===0?"A":"B"} ഈ റൗണ്ട് നേടി!`);
    else if(isMyTurnToGuess()) say("gameMessage","ട്രേയിൽ നിന്ന് അക്ഷരം ക്ലിക്ക് ചെയ്യൂ അല്ലെങ്കിൽ ബോർഡിലേക്ക് വലിച്ചിടൂ.");
    else say("gameMessage","മറു ടീമിന്റെ ഊഹത്തിനായി കാത്തിരിക്കുന്നു.");
    $("boardHint").textContent="ശരിയായ അക്ഷരങ്ങൾ തുറക്കും · അഞ്ച് തെറ്റുകൾ കഴിഞ്ഞാൽ റൗണ്ട് തീരും";
  }
  function renderCreatorBuilder() {
    const builder=$("answerBuilder"), tray=$("creatorAlphabetTray");
    if (!builder || !tray) return;
    builder.innerHTML="";
    if (!draftAnswer) {
      const placeholder=document.createElement("span");
      placeholder.className="builder-placeholder";
      placeholder.textContent="അക്ഷരങ്ങൾ ഇവിടെ ചേർക്കൂ…";
      builder.appendChild(placeholder);
    } else {
      graphemes(draftAnswer).forEach(ch=>{
        const chip=document.createElement("span");
        chip.className="builder-chip";
        chip.textContent=ch===" "?"␠":ch;
        builder.appendChild(chip);
      });
    }
    tray.innerHTML="";
    ALPHABET.forEach(ch=>{
      const b=document.createElement("button");
      b.type="button"; b.className="letter-tile"; b.textContent=ch;
      b.draggable=true; b.setAttribute("aria-label",`അക്ഷരം ${ch} ചേർക്കുക`);
      b.addEventListener("click",()=>addAnswerCharacter(ch));
      b.addEventListener("dragstart",e=>{e.dataTransfer.setData("text/plain",ch);e.dataTransfer.effectAllowed="copy";});
      tray.appendChild(b);
    });
    builder.ondragover=e=>{e.preventDefault();builder.classList.add("drag-over");};
    builder.ondragleave=()=>builder.classList.remove("drag-over");
    builder.ondrop=e=>{e.preventDefault();builder.classList.remove("drag-over");const ch=e.dataTransfer.getData("text/plain");if(ch)addAnswerCharacter(ch);};
  }
  function addAnswerCharacter(ch) {
    if (!ch || graphemes(draftAnswer).length>=50) { toast("സിനിമയുടെ പേര് കുറച്ച് ചുരുക്കൂ."); return; }
    draftAnswer += ch;
    renderCreatorBuilder();
  }
  function undoAnswerCharacter() {
    const parts=graphemes(draftAnswer);
    parts.pop();
    draftAnswer=parts.join("");
    renderCreatorBuilder();
  }
  async function submitPuzzle() {
    if(!isHost||!roomData)return;
    const answer=normalize(draftAnswer), hint=normalize($("movieHint").value);
    if(!answer||!/[ഀ-ൿ]/u.test(answer)){toast("സിനിമയുടെ പേര് മലയാളത്തിൽ നൽകൂ.");return;}
    if(graphemes(answer).filter(c=>!/\s/u.test(c)).length>50){toast("ചെറിയ സിനിമയുടെ പേര് പരീക്ഷിക്കൂ.");return;}
    const creatorTeam=myPlayer()?.team??0;
    localHostAnswer=answer;
    const puzzle={creatorTeam,mask:graphemes(answer).map(c=>/\s/u.test(c)?" ":/[.,!?'"():\-]/u.test(c)?c:"_").join(""),hint:hint||""};
    if(localMode){localState.puzzle=puzzle;localState.guesses={};localState.placements={};localState.wrong=0;localState.finished=false;localState.winner=null;roomData=localState;renderGame();}
    else {
      await roomRef.update({puzzle,guesses:{},placements:{},wrong:0,finished:false,winner:null});
      await db.ref("roomSecrets/"+roomCode).set({answer,hint});
    }
    draftAnswer=""; $("movieHint").value=""; renderCreatorBuilder();
  }
  async function guessLetter(ch,index=null) {
    if(!isMyTurnToGuess()||roomData.finished||!roomData.puzzle)return;
    const shown=graphemes(roomData.puzzle.mask||""), placements=roomData.placements||{};
    if(index===null) index=shown.findIndex(slot=>slot==="_");
    if(index===null||index<0||shown[index]!=="_") { toast("ആദ്യം ഒരു ഒഴിഞ്ഞ ഡാഷിൽ അക്ഷരം ചേർക്കൂ."); return; }
    if(localMode) { await hostProcessGuess(ch,index); return; }
    // Only the chosen character and blank position are sent; the movie answer stays with the host.
    try {
      await roomRef.child("guessRequests/"+uid).set({letter:ch,index,at:Date.now()});
      toast("അക്ഷരം അയച്ചു…");
    } catch(e) { console.error(e); toast("അക്ഷരം അയയ്ക്കാനായില്ല."); }
  }
  async function hostProcessGuess(ch,index=null) {
    if(!isHost||!roomData||!roomData.puzzle||roomData.finished)return;
    const answer=localHostAnswer;
    if(!answer){toast("ഹോസ്റ്റിന്റെ ബ്രൗസറിൽ ഉത്തരം ലഭ്യമല്ല. ചോദ്യം വീണ്ടും തയ്യാറാക്കൂ.");return;}
    const answerSlots=graphemes(answer), maskSlots=graphemes(roomData.puzzle.mask||"");
    const placements={...(roomData.placements||{})};
    if(index===null) index=maskSlots.findIndex(slot=>slot==="_");
    if(index<0||index>=answerSlots.length||maskSlots[index]!=="_")return;
    const current=placements[index]||"";
    if(current.includes(ch))return;
    const target=answerSlots[index];
    const correct=target.includes(ch);
    const nextPlaced=correct?(current+ch).normalize("NFC"):current;
    if(correct) placements[index]=nextPlaced;
    const wrong=(roomData.wrong||0)+(correct?0:1);
    const matchesSlot=(target,placed)=>{
      const expected=[...target], actual=[...placed];
      return expected.length===actual.length && expected.every(part=>actual.includes(part));
    };
    const slotComplete=answerSlots.map((target,i)=>/\s/u.test(target)||/[.,!?'":\-]/u.test(target)||matchesSlot(target,placements[i]||""));
    const won=slotComplete.every(Boolean);
    const finished=won||wrong>=5;
    const winner=won?(1-roomData.puzzle.creatorTeam):roomData.puzzle.creatorTeam;
    const scores={...(roomData.scores||{0:0,1:0})};
    if(finished)scores[winner]=(scores[winner]||0)+1;
    const revealedMask=answerSlots.map((target,i)=>/\s/u.test(target)?" ":/[.,!?'":\-]/u.test(target)?target:(matchesSlot(target,placements[i]||"")?target:"_")).join("");
    const patch={guesses:{...(roomData.guesses||{}),[String(index)+":"+ch]:true},placements,wrong,finished,winner,scores,puzzle:{...roomData.puzzle,mask:revealedMask}};
    await updateRoom(patch);
    if(!correct&&!finished)toast(`തെറ്റായ അക്ഷരം! ഇനി ${5-wrong} അവസരം.`);
    if(correct&&!won)toast("ശരിയായ അക്ഷരം ചേർത്തു!");
    if(won)toast("ശരിയായ ഉത്തരം! 🎉");
    if(wrong>=5&&!won)toast("അഞ്ച് തെറ്റുകൾ! റൗണ്ട് അവസാനിച്ചു.");
  }
  async function nextRound() {
    if(!isHost)return;
    const next=(roomData.round||1)+1;
    await updateRoom({round:next,puzzle:null,guesses:{},placements:{},wrong:0,finished:false,winner:null});
    if(!localMode)await db.ref("roomSecrets/"+roomCode).set({answer:"",hint:""});
    localHostAnswer="";
  }
  $("hintBtn").addEventListener("click",async()=>{
    if(!roomData?.puzzle?.hint){toast("ഈ റൗണ്ടിൽ സൂചനയില്ല.");return;}
    if(!isMyTurnToGuess())return;
    const hint=roomData.puzzle.hint;
    toast(hint||"സൂചന നൽകിയിട്ടില്ല.");
  });
  function returnToLobby(){if(unsubscribe)unsubscribe();unsubscribe=null;roomRef=null;roomData=null;roomCode="";isHost=false;localHostAnswer="";setScreen($lobby);}
  async function leaveRoom(){try{if(!localMode&&roomRef&&uid)await roomRef.child("players/"+uid).remove();}catch(e){console.warn(e);}returnToLobby();}
  document.querySelectorAll(".mode-choice").forEach(b=>b.addEventListener("click",()=>{selectedMode=b.dataset.mode;document.querySelectorAll(".mode-choice").forEach(x=>x.classList.toggle("selected",x===b));}));
  $("createRoom").addEventListener("click",createRoom); $("joinRoom").addEventListener("click",joinRoom);
  $("startGame").addEventListener("click",startGame); $("submitPuzzle").addEventListener("click",submitPuzzle);
  $("addWordSpace").addEventListener("click",()=>addAnswerCharacter(" "));
  $("undoAnswer").addEventListener("click",undoAnswerCharacter);
  $("clearAnswer").addEventListener("click",()=>{draftAnswer="";renderCreatorBuilder();});
  $("nextRound").addEventListener("click",nextRound); $("backToLobby").addEventListener("click",leaveRoom); $("leaveWaiting").addEventListener("click",leaveRoom);
  $("roomCodeDisplay").addEventListener("click",()=>{navigator.clipboard?.writeText(roomCode).then(()=>toast("മുറിയുടെ കോഡ് പകർത്തി!")).catch(()=>toast("കോഡ്: "+roomCode));});
  $("roomCode").addEventListener("input",e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""));
  $("helpBtn").addEventListener("click",()=>$("helpDialog").showModal()); $("closeHelp").addEventListener("click",()=>$("helpDialog").close());
  $("playerName").value="";
  if(!firebaseReady) $("connectionBadge").textContent="ഡെമോ മോഡ്";
})();