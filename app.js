(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const MALAYALAM = [..."അആഇഈഉഊഋൠഌൡഎഏഐഒഓഔകഖഗഘങചഛജഝഞടഠഡഢണതഥദധനപഫബഭമയരലവശഷസഹളഴറ"];
  const SIGNS = [..."ാിീുൂൃൄൢൣെേൈൊോൌംഃ്ൺൻർൽൾൿ"];
  const ALPHABET = [...new Set([...MALAYALAM, ...SIGNS])];
  const $lobby = $("lobby"), $waiting = $("waiting"), $game = $("game");
  let selectedMode = "1v1", localMode = true, db = null, auth = null, uid = "local-"+Math.random().toString(36).slice(2), selectedGuessIndex = null;
  let roomCode = "", roomRef = null, roomData = null, unsubscribe = null, myName = "", toastTimer = null;
  let localPlayers = [], localState = null, isHost = false, localHostAnswer = "", draftAnswer = "";
  const normalize = s => (s || "").normalize("NFC").replace(/\s+/g," ").trim();
  const graphemes = s => {
    if (window.Intl && Intl.Segmenter) return [...new Intl.Segmenter("ml",{granularity:"grapheme"}).segment(s)].map(x=>x.segment);
    return [...s];
  };
  const isMalayalamSign = ch => /[\u0D02-\u0D03\u0D3A-\u0D4D\u0D57]/u.test(ch);
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
    $("guessDrawingTools").classList.toggle("hidden",!puzzle||!isMyTurnToGuess()||!!roomData.finished);
    resizeDrawingPads();
    $("nextRound").classList.toggle("hidden",!roomData.finished||!isHost);
    $("hintBtn").disabled=!puzzle||!puzzle.hint||!isMyTurnToGuess();
    if(!puzzle){
      $("turnBanner").textContent=isHost?"നിങ്ങളുടെ ടീം സിനിമയുടെ പേര് വരയ്ക്കൂ.":"ഹോസ്റ്റ് ചോദ്യം തയ്യാറാക്കുകയാണ്…";
      $("wordSlots").innerHTML="";
      say("gameMessage",isHost?"മലയാളത്തിൽ പേര് വരച്ച് തിരിച്ചറിയുക. ഉത്തരം മറച്ചുവെക്കും.":"ചോദ്യം വരുന്നതുവരെ കാത്തിരിക്കൂ.");
      return;
    }
    const creatorTeam=puzzle.creatorTeam, guessingTeam=1-creatorTeam;
    $("turnBanner").textContent=p?.team===creatorTeam?"നിങ്ങളുടെ ടീമാണ് ചോദ്യം ഒരുക്കിയത്. മറുവശം ഊഹിക്കട്ടെ.":`ടീം ${guessingTeam===0?"A":"B"} ഊഹിക്കുന്നു — അക്ഷരങ്ങൾ തിരഞ്ഞെടുക്കൂ!`;
    $("mistakesLabel").innerHTML=`തെറ്റുകൾ <b>${roomData.wrong||0}</b>/5`;
    const placements=roomData.placements||{};
    // The full answer is never rendered to non-host clients.
    const shown=Array.from(puzzle.mask||"");
    const slots=$("wordSlots"); slots.innerHTML="";
    for(let index=0;index<shown.length;index++){
      const ch=shown[index], span=document.createElement("span"), slotIndex=index;
      if(ch===" "){span.className="letter-slot space";span.textContent="";}
      else if(/[.,!?'":\\-]/u.test(ch)){span.className="letter-slot punctuation";span.textContent=ch;}
      else if(isMalayalamSign(ch)){span.className="letter-slot punctuation";span.textContent=ch;}
      else {
        const revealed=ch!=="_", placed=placements[index]||"";
        span.className="letter-slot"+(revealed?" revealed":placed?" placed":"")+(slotIndex===selectedGuessIndex?" selected-slot":"");
        span.textContent=revealed?ch:placed;
        if(!revealed && isMyTurnToGuess() && !roomData.finished) span.addEventListener("click",()=>{selectedGuessIndex=slotIndex;renderGame();});
      }
      slots.appendChild(span);
    }
    if(selectedGuessIndex!==null && shown[selectedGuessIndex]!=="_") selectedGuessIndex=null;
    if(selectedGuessIndex===null) selectedGuessIndex=shown.findIndex((ch,i)=>ch==="_" && !(placements[i]||""));
    $("selectedSlotLabel").textContent=selectedGuessIndex===null?"ഡാഷ് തിരഞ്ഞെടുക്കുക":`സ്ഥാനം ${selectedGuessIndex+1}`;
    if(roomData.finished) say("gameMessage",roomData.winner===null?"റൗണ്ട് അവസാനിച്ചു.":`ടീം ${roomData.winner===0?"A":"B"} ഈ റൗണ്ട് നേടി!`);
    else if(isMyTurnToGuess()) say("gameMessage","ഒരു ഒഴിഞ്ഞ ഡാഷ് തിരഞ്ഞെടുക്കുക; അതിനുള്ള അക്ഷരം വരച്ച് തിരിച്ചറിയൂ.");
    else say("gameMessage","മറു ടീമിന്റെ ഊഹത്തിനായി കാത്തിരിക്കുന്നു.");
    $("boardHint").textContent="ശരിയായ അക്ഷരങ്ങൾ തുറക്കും · അഞ്ച് തെറ്റുകൾ കഴിഞ്ഞാൽ റൗണ്ട് തീരും";
  }
  function renderCreatorBuilder() {
    const builder=$("answerBuilder"), tray=$("creatorAlphabetTray");
    if (!builder || !tray) return;
    builder.innerHTML="";
    const chars=Array.from(draftAnswer);
    if (!chars.length) {
      const placeholder=document.createElement("span");
      placeholder.className="builder-placeholder";
      placeholder.textContent="ആദ്യം “ഡാഷ് ചേർക്കുക” അമർത്തൂ, പിന്നെ അക്ഷരങ്ങൾ വലിച്ചിടൂ…";
      builder.appendChild(placeholder);
    } else {
      chars.forEach((ch,index)=>{
        const chip=document.createElement("span");
        chip.className=ch==="_"?"builder-chip builder-slot":"builder-chip";
        chip.textContent=ch===" "?"␠":ch==="_"?"—":ch;
        if(ch==="_"){
          chip.setAttribute("aria-label","അക്ഷരം ഇടാനുള്ള ഒഴിഞ്ഞ സ്ഥലം");
          chip.ondragover=e=>{e.preventDefault();chip.classList.add("drag-over");};
          chip.ondragleave=()=>chip.classList.remove("drag-over");
          chip.ondrop=e=>{
            e.preventDefault();e.stopPropagation();chip.classList.remove("drag-over");
            const letter=e.dataTransfer.getData("text/plain");
            if(letter)addAnswerCharacter(letter,index);
          };
        }
        builder.appendChild(chip);
      });
    }
    tray.innerHTML="";
    ALPHABET.forEach(ch=>{
      const b=document.createElement("button");
      b.type="button"; b.className="letter-tile"; b.textContent=ch;
      b.draggable=true; b.setAttribute("aria-label",`അക്ഷരം ${ch} വലിച്ചിടുക`);
      b.addEventListener("dragstart",e=>{e.dataTransfer.setData("text/plain",ch);e.dataTransfer.effectAllowed="copy";});
      tray.appendChild(b);
    });
  }
  function addDash() {
    if(Array.from(draftAnswer).length>=50){toast("സിനിമയുടെ പേര് കുറച്ച് ചുരുക്കൂ.");return;}
    draftAnswer+="_";
    renderCreatorBuilder();
  }
  function addAnswerCharacter(ch,index) {
    if(!ch||index===undefined)return;
    const parts=Array.from(draftAnswer);
    if(parts[index]!=="_"){toast("അക്ഷരം ചേർക്കാൻ ഒഴിഞ്ഞ ഡാഷിലേക്ക് വലിച്ചിടൂ.");return;}
    parts[index]=ch;
    draftAnswer=parts.join("");
    renderCreatorBuilder();
  }
  function addWordSpace() {
    const parts=Array.from(draftAnswer);
    if(parts.length && parts[parts.length-1]!==" ") draftAnswer+=" ";
    renderCreatorBuilder();
  }
  function undoAnswerCharacter() {
    const parts=Array.from(draftAnswer);
    parts.pop();
    draftAnswer=parts.join("");
    renderCreatorBuilder();
  }
  async function submitPuzzle() {
    if(!isHost||!roomData)return;
    const answer=normalize($("movieAnswer").value), hint=normalize($("movieHint").value);
    if(!answer||!/[\u0D00-\u0D7F]/u.test(answer)){toast("സിനിമയുടെ പേര് വരച്ച് തിരിച്ചറിഞ്ഞ് ഉറപ്പാക്കൂ.");return;}
    if(graphemes(answer).filter(c=>! /\s/u.test(c)).length>50){toast("ചെറിയ സിനിമയുടെ പേര് പരീക്ഷിക്കൂ.");return;}
    const creatorTeam=myPlayer()?.team??0;
    localHostAnswer=answer;
    const puzzle={creatorTeam,mask:Array.from(answer).map(c=>/\s/u.test(c)||isMalayalamSign(c)||/[.,!?'"():\\-]/u.test(c)?c:"_").join(""),hint:hint||""};
    if(localMode){localState.puzzle=puzzle;localState.guesses={};localState.placements={};localState.wrong=0;localState.finished=false;localState.winner=null;roomData=localState;renderGame();}
    else {
      await roomRef.update({puzzle,guesses:{},placements:{},wrong:0,finished:false,winner:null});
      await db.ref("roomSecrets/"+roomCode).set({answer,hint});
    }
    $("movieAnswer").value="";$("movieHint").value="";clearCanvas("answerCanvas");
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
    const answerSlots=Array.from(answer), maskSlots=Array.from(roomData.puzzle.mask||"");
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
    const revealedMask=answerSlots.map((target,i)=>/\s/u.test(target)||isMalayalamSign(target)||/[.,!?'":\-]/u.test(target)?target:(matchesSlot(target,placements[i]||"")?target:"_")).join("");
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
  $("nextRound").addEventListener("click",nextRound); $("backToLobby").addEventListener("click",leaveRoom); $("leaveWaiting").addEventListener("click",leaveRoom);
  $("roomCodeDisplay").addEventListener("click",()=>{navigator.clipboard?.writeText(roomCode).then(()=>toast("മുറിയുടെ കോഡ് പകർത്തി!")).catch(()=>toast("കോഡ്: "+roomCode));});
  $("roomCode").addEventListener("input",e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""));
  $("helpBtn").addEventListener("click",()=>$("helpDialog").showModal()); $("closeHelp").addEventListener("click",()=>$("helpDialog").close());

  // Pointer-enabled drawing pads for mouse, stylus and touch.
  const canvasContexts={};
  function initDrawingCanvas(id){
    const canvas=$(id);if(!canvas||canvasContexts[id])return;
    const ctx=canvas.getContext("2d");canvasContexts[id]=ctx;
    let drawing=false,last=null;
    const resize=()=>{
      const rect=canvas.getBoundingClientRect();if(!rect.width)return;
      const old=document.createElement("canvas");old.width=canvas.width;old.height=canvas.height;
      if(old.width&&old.height)old.getContext("2d").drawImage(canvas,0,0);
      const ratio=Math.max(1,window.devicePixelRatio||1);
      canvas.width=Math.round(rect.width*ratio);canvas.height=Math.round((canvas.classList.contains("answer-canvas")?250:220)*ratio);
      ctx.setTransform(ratio,0,0,ratio,0,0);ctx.fillStyle="#fff";ctx.fillRect(0,0,rect.width,canvas.classList.contains("answer-canvas")?250:220);
      ctx.strokeStyle="#20172d";ctx.lineWidth=5;ctx.lineCap="round";ctx.lineJoin="round";
      if(old.width&&old.height)ctx.drawImage(old,0,0,old.width,old.height,0,0,rect.width,canvas.classList.contains("answer-canvas")?250:220);
    };
    canvas.style.height=canvas.classList.contains("answer-canvas")?"250px":"220px";
    canvasContexts[id]={ctx,resize};
    resize();
    canvas.addEventListener("pointerdown",e=>{e.preventDefault();canvas.setPointerCapture(e.pointerId);drawing=true;const r=canvas.getBoundingClientRect();last={x:e.clientX-r.left,y:e.clientY-r.top};ctx.beginPath();ctx.arc(last.x,last.y,2.5,0,Math.PI*2);ctx.fillStyle="#20172d";ctx.fill();});
    canvas.addEventListener("pointermove",e=>{if(!drawing)return;e.preventDefault();const r=canvas.getBoundingClientRect(),p={x:e.clientX-r.left,y:e.clientY-r.top};ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();last=p;});
    const stop=()=>{drawing=false;last=null;};canvas.addEventListener("pointerup",stop);canvas.addEventListener("pointercancel",stop);
  }
  function resizeDrawingPads(){Object.values(canvasContexts).forEach(x=>x.resize?.());}
  function clearCanvas(id){
    const canvas=$(id),entry=canvasContexts[id];if(!canvas||!entry)return;
    const ctx=entry.ctx,ratio=Math.max(1,window.devicePixelRatio||1),w=canvas.clientWidth||canvas.width/ratio,h=canvas.classList.contains("answer-canvas")?250:220;
    ctx.save();ctx.setTransform(ratio,0,0,ratio,0,0);ctx.fillStyle="#fff";ctx.fillRect(0,0,w,h);ctx.restore();
  }
  async function recognizeCanvas(id,statusId){
    if(!window.Tesseract){say(statusId,"OCR ലൈബ്രറി ലോഡ് ആയില്ല. ഇന്റർനെറ്റ് കണക്ഷൻ പരിശോധിക്കൂ.");return "";}
    say(statusId,"മലയാളം എഴുത്ത് തിരിച്ചറിയാൻ ശ്രമിക്കുന്നു…");
    try{
      const result=await Tesseract.recognize($(id),"mal",{logger:m=>{if(m.status==="recognizing text")say(statusId,"തിരിച്ചറിയുന്നു… "+Math.round((m.progress||0)*100)+"%");}});
      const text=normalize(result.data.text).replace(/[^\u0D00-\u0D7F\s]/gu,"").replace(/\s+/g," ").trim();
      say(statusId,text?"തിരിച്ചറിഞ്ഞത്: "+text+" (വിശ്വാസനില "+Math.round(result.data.confidence||0)+"%)":"തിരിച്ചറിയാൻ കഴിഞ്ഞില്ല. കൂടുതൽ വ്യക്തമായി വീണ്ടും വരയ്ക്കൂ.");
      return text;
    }catch(e){console.warn(e);say(statusId,"തിരിച്ചറിയാൻ കഴിഞ്ഞില്ല. വീണ്ടും ശ്രമിക്കൂ.");return "";}
  }
  $("recognizeAnswer").addEventListener("click",async()=>{
    const text=await recognizeCanvas("answerCanvas","answerOcrStatus");if(text)$("movieAnswer").value=text;
  });
  $("clearAnswerCanvas").addEventListener("click",()=>{clearCanvas("answerCanvas");$("movieAnswer").value="";say("answerOcrStatus","പുതിയതായി വരയ്ക്കാം.");});
  $("clearGuessCanvas").addEventListener("click",()=>{clearCanvas("guessCanvas");say("guessOcrStatus","ഒരു അക്ഷരം വ്യക്തമായി വരയ്ക്കുക.");});
  $("recognizeGuess").addEventListener("click",async()=>{
    if(!isMyTurnToGuess()||roomData?.finished){toast("ഇപ്പോൾ നിങ്ങളുടെ ടീമിന്റെ ഊഹിക്കാനുള്ള ടേൺ അല്ല.");return;}
    if(selectedGuessIndex===null||selectedGuessIndex<0){toast("ആദ്യം ഒരു ഒഴിഞ്ഞ ഡാഷ് തിരഞ്ഞെടുക്കൂ.");return;}
    const text=await recognizeCanvas("guessCanvas","guessOcrStatus");
    const letter=graphemes(text).find(ch=>/[\u0D05-\u0D39\u0D7A-\u0D7F]/u.test(ch));
    if(!letter){say("guessOcrStatus","അക്ഷരം തിരിച്ചറിയാനായില്ല. വലുതായി ഒറ്റ അക്ഷരം മാത്രം വരയ്ക്കൂ.");return;}
    const basic=[...letter].find(ch=>/[\u0D05-\u0D39\u0D7A-\u0D7F]/u.test(ch));
    if(!basic){say("guessOcrStatus","മലയാളം അക്ഷരം തിരിച്ചറിയാനായില്ല.");return;}
    say("guessOcrStatus","തിരിച്ചറിഞ്ഞ അക്ഷരം: "+letter+" — പരിശോധിക്കുന്നു…");
    await guessLetter(basic,selectedGuessIndex);
    clearCanvas("guessCanvas");
  });
  initDrawingCanvas("answerCanvas");initDrawingCanvas("guessCanvas");
  window.addEventListener("resize",resizeDrawingPads);

  $("playerName").value="";
  if(!firebaseReady) $("connectionBadge").textContent="ഡെമോ മോഡ്";
})();