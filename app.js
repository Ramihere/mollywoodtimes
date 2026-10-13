(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const MALAYALAM = [..."അആഇഈഉഊഋൠഌൡഎഏഐഒഓഔകഖഗഘങചഛജഝഞടഠഡഢണതഥദധനപഫബഭമയരലവശഷസഹളഴറ"];
  const SIGNS = [..."ാിീുൂൃൄൢൣെേൈൊോൌംഃ്ൺൻർൽൾൿ"];
  const ALPHABET = [...new Set([...MALAYALAM, ...SIGNS])];
  const $lobby = $("lobby"), $waiting = $("waiting"), $game = $("game");
  let selectedMode = "1v1", localMode = true, db = null, auth = null, uid = "local-"+Math.random().toString(36).slice(2), selectedGuessIndex = null;
  let roomCode = "", roomRef = null, roomData = null, unsubscribe = null, myName = "", toastTimer = null, chatRef = null, chatCb = null;
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
      round:1, scores:{0:0,1:0}, puzzle:null, guesses:{}, drawings:{}, marks:{}, chat:[], wrong:0, finished:false, winner:null };
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
      } catch(e) {
        console.error("Firebase create-room error:", e);
        const detail = e?.code || e?.message || "Unknown error";
        toast("Firebase error: " + detail);
        say("lobbyMessage", "Firebase error: " + detail);
        return;
      }
    }
    localMode=true; isHost=true; roomCode=makeCode();
    const host={uid:"local-host",name:myName,team:0};
    localPlayers=selectedMode==="2v2"
      ? [host,{uid:"demo-a2",name:"ടീം A ഡെമോ",team:0},{uid:"demo-b1",name:"സുഹൃത്ത് (ഡെമോ)",team:1},{uid:"demo-b2",name:"ടീം B ഡെമോ",team:1}]
      : [host,{uid:"demo-guest",name:"സുഹൃത്ത് (ഡെമോ)",team:1}];
    localState=freshRoom(roomCode,selectedMode,host);
    localState.players=Object.fromEntries(localPlayers.map(p=>[p.uid,p]));
    localState.hostUid="local-host"; uid="local-host";
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
    let lastRenderKey="";
    const cb=roomRef.on("value",snap=>{
      if(!snap.exists()){toast("മുറി അവസാനിച്ചു.");returnToLobby();return;}
      const nextData=snap.val();
      // Chat-only updates must not rebuild drawing canvases or erase unfinished strokes.
      const renderKey=JSON.stringify({...nextData,chat:undefined});
      const shouldRender=renderKey!==lastRenderKey;
      lastRenderKey=renderKey;
      roomData=nextData; $("gameRoomCode").textContent=roomCode; $("roomCodeDisplay").innerHTML=roomCode+" <span>▢</span>";
      if(shouldRender){
        if(roomData.status==="waiting"){if($waiting.classList.contains("hidden"))setScreen($waiting);renderPlayers();}
        else {if($game.classList.contains("hidden"))setScreen($game);renderGame();}
      }
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
    chatRef=roomRef.child("chat");
    chatCb=chatRef.on("value",snap=>{renderChat(snap.val());});
    unsubscribe=()=>{roomRef.off("value",cb); if(requestRef && requestCb) requestRef.off("child_added",requestCb); if(chatRef&&chatCb)chatRef.off("value",chatCb);};
  }
  async function updateRoom(patch) {
    if(localMode){Object.assign(localState,patch);roomData=localState;renderGame();return;}
    await roomRef.update(patch);
  }
  async function startGame() {
    if(!isHost){toast("ഹോസ്റ്റിന് മാത്രമേ കളി തുടങ്ങാനാകൂ.");return;}
    if(!roomData){toast("മുറി തയ്യാറായിട്ടില്ല. വീണ്ടും ശ്രമിക്കൂ.");return;}
    const players=currentPlayers(), max=roomData.mode==="2v2"?4:2;
    if(players.length<max){toast("എല്ലാ കളിക്കാരും ചേരട്ടെ.");return;}
    const button=$("startGame");button.disabled=true;
    try{
      await updateRoom({status:"playing",round:1,scores:{0:0,1:0},puzzle:null,guesses:{},placements:{},drawings:{},marks:{},chat:[],wrong:0,finished:false,winner:null});
      setScreen($game);
      renderGame();
    }catch(e){
      console.error("Unable to start game:",e);
      toast("കളി തുടങ്ങാനായില്ല. Firebase rules / connection പരിശോധിക്കൂ.");
      button.disabled=false;
    }
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
    const clueView=$("clueDrawingView");
    clueView.classList.toggle("hidden",!puzzle||!puzzle.clueDrawing);
    if(puzzle?.clueDrawing)$("clueDrawingImage").src=puzzle.clueDrawing;
    $("nextRound").classList.toggle("hidden",!roomData.finished||!isHost);
    $("hintBtn").disabled=!puzzle||!puzzle.hint||!isMyTurnToGuess();
    if(!puzzle){
      $("turnBanner").textContent=isHost?"നിങ്ങളുടെ ടീം സിനിമയുടെ പേര് നൽകൂ.":"ഹോസ്റ്റ് ചോദ്യം തയ്യാറാക്കുകയാണ്…";
      $("wordSlots").innerHTML="";
      say("gameMessage",isHost?"മലയാളത്തിൽ സിനിമയുടെ പേര് നൽകൂ. ഉത്തരം മറച്ചുവെക്കും.":"ചോദ്യം വരുന്നതുവരെ കാത്തിരിക്കൂ.");
      return;
    }
    const creatorTeam=puzzle.creatorTeam, guessingTeam=1-creatorTeam;
    $("turnBanner").textContent=p?.team===creatorTeam?"നിങ്ങളുടെ ടീമാണ് ചോദ്യം ഒരുക്കിയത്. മറുവശം ഊഹിക്കട്ടെ.":`ടീം ${guessingTeam===0?"A":"B"} ഊഹിക്കുന്നു — ഡാഷിൽ അക്ഷരം വരച്ച് അയയ്ക്കൂ!`;
    $("mistakesLabel").innerHTML=`തെറ്റുകൾ <b>${roomData.wrong||0}</b>/5`;
    const placements=roomData.placements||{}, drawings=roomData.drawings||{}, marks=roomData.marks||{};
    // The full answer is never rendered to non-host clients.
    const shown=Array.from(puzzle.mask||"");
    if(selectedGuessIndex!==null && shown[selectedGuessIndex]!=="_") selectedGuessIndex=null;
    if(selectedGuessIndex===null) selectedGuessIndex=shown.findIndex((ch,i)=>ch==="_" && !(placements[i]||""));
    const slots=$("wordSlots"); slots.innerHTML="";
    for(let index=0;index<shown.length;index++){
      const ch=shown[index], span=document.createElement("span"), slotIndex=index;
      if(ch===" "){span.className="letter-slot space";span.textContent="";}
      else if(/[.,!?'":\\-]/u.test(ch)){span.className="letter-slot punctuation";span.textContent=ch;}
      else if(isMalayalamSign(ch)){span.className="letter-slot punctuation";span.textContent=ch;}
      else {
        const revealed=ch!=="_", placed=placements[index]||"", drawing=drawings[index], mark=marks[index];
        span.className="letter-slot"+(revealed?" revealed":placed?" placed":"")+(slotIndex===selectedGuessIndex?" selected-slot":"");
        if(revealed){span.textContent=ch;}
        else if(drawing){
          const img=document.createElement("img");img.className="submitted-drawing";img.alt="കളിക്കാരൻ വരച്ച അക്ഷരം";img.src=drawing.dataUrl;span.appendChild(img);
          if(mark==="wrong"&&isMyTurnToGuess()&&!roomData.finished){
            const retry=document.createElement("button");retry.type="button";retry.className="retry-drawing";retry.textContent="↻";retry.title="വീണ്ടും വരയ്ക്കുക";
            retry.addEventListener("click",e=>{e.stopPropagation();resetDrawing(slotIndex);});span.appendChild(retry);
          }
          if(isHost&&!roomData.finished&&!mark){
            const controls=document.createElement("div");controls.className="judge-controls";
            const yes=document.createElement("button");yes.type="button";yes.className="judge-yes";yes.textContent="✓";yes.title="അക്ഷരം ശരി";yes.addEventListener("click",e=>{e.stopPropagation();openLetterPicker(slotIndex);});
            const no=document.createElement("button");no.type="button";no.className="judge-no";no.textContent="✕";no.title="അക്ഷരം തെറ്റ്";no.addEventListener("click",e=>{e.stopPropagation();judgeDrawing(slotIndex,false);});
            controls.append(yes,no);span.appendChild(controls);
          }
        } else if(isMyTurnToGuess()&&!roomData.finished){
          span.addEventListener("click",()=>{selectedGuessIndex=slotIndex;renderGame();});
          const pad=document.createElement("canvas");pad.className="slot-draw-canvas";pad.width=84;pad.height=100;pad.dataset.index=String(slotIndex);pad.setAttribute("aria-label",`സ്ഥാനം ${slotIndex+1}-ൽ അക്ഷരം വരയ്ക്കുക`);
          span.appendChild(pad);initSlotCanvas(pad);
        } else {span.textContent=placed||"—";}

      }
      if(marks[index]==="correct"||marks[index]==="wrong"){
        const markNode=document.createElement("span");
        markNode.className="slot-mark "+(marks[index]==="correct"?"correct-mark":"wrong-mark");
        markNode.textContent=marks[index]==="correct"?"✓":"✕";
        markNode.title=marks[index]==="correct"?"ശരി":"തെറ്റ്";
        span.appendChild(markNode);
      }
      slots.appendChild(span);
    }
    $("selectedSlotLabel").textContent=selectedGuessIndex===null?"ഡാഷ് തിരഞ്ഞെടുക്കുക":`സ്ഥാനം ${selectedGuessIndex+1}`;
    if(roomData.finished) say("gameMessage",roomData.winner===null?"റൗണ്ട് അവസാനിച്ചു.":`ടീം ${roomData.winner===0?"A":"B"} ഈ റൗണ്ട് നേടി!`);
    else if(isMyTurnToGuess()) say("gameMessage","ഓരോ ഒഴിഞ്ഞ സ്ഥാനത്തും അക്ഷരം വരച്ച് അയയ്ക്കൂ. ചോദ്യം തയ്യാറാക്കിയ ടീം അത് പരിശോധിക്കും.");
    else say("gameMessage","മറു ടീം അക്ഷരം വരയ്ക്കുന്നു; ശരിയോ തെറ്റോ എന്ന് അടയാളപ്പെടുത്തൂ.");
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
    if(!answer||!/[\u0D00-\u0D7F]/u.test(answer)){toast("താഴെയുള്ള അക്ഷരങ്ങൾ ഉപയോഗിച്ച് സിനിമയുടെ പേര് തയ്യാറാക്കൂ.");return;}
    if(!clueHasInk){toast("ആദ്യം വലിയ പാഡിൽ ഡാഷുകളോ ചിഹ്നങ്ങളോ വരയ്ക്കൂ.");return;}
    if(graphemes(answer).filter(c=>! /\s/u.test(c)).length>50){toast("ചെറിയ സിനിമയുടെ പേര് പരീക്ഷിക്കൂ.");return;}
    const creatorTeam=myPlayer()?.team??0;
    localHostAnswer=answer;selectedGuessIndex=null;
    const clueDrawing=$("clueCanvas").toDataURL("image/jpeg",0.72);
    const puzzle={creatorTeam,mask:Array.from(answer).map(c=>/\s/u.test(c)||isMalayalamSign(c)||/[.,!?'"():\\-]/u.test(c)?c:"_").join(""),hint:hint||"",clueDrawing};
    if(localMode){localState.puzzle=puzzle;localState.guesses={};localState.placements={};localState.drawings={};localState.marks={};localState.chat=[];localState.wrong=0;localState.finished=false;localState.winner=null;roomData=localState;renderGame();renderChat([]);}
    else {
      await roomRef.update({puzzle,guesses:{},placements:{},drawings:{},marks:{},chat:[],wrong:0,finished:false,winner:null});
      await db.ref("roomSecrets/"+roomCode).set({answer,hint});
    }
    $("movieAnswer").value="";$("movieHint").value="";
  }
  async function guessLetter(ch,index=null) {
    if(!isMyTurnToGuess()||roomData.finished||!roomData.puzzle)return;
    const shown=Array.from(roomData.puzzle.mask||"");
    if(index===null) index=selectedGuessIndex;
    if(index===null||index<0||shown[index]!=="_") { toast("ആദ്യം ഒരു ഒഴിഞ്ഞ ഡാഷ് തിരഞ്ഞെടുക്കൂ."); return; }
    const pad=document.querySelector(`.slot-draw-canvas[data-index="${index}"]`);
    if(!pad){toast("ആ സ്ഥാനത്ത് അക്ഷരം വരയ്ക്കൂ.");return;}
    const dataUrl=pad.toDataURL("image/png");
    const drawing={dataUrl,by:uid,name:myPlayer()?.name||myName,at:Date.now()};
    try {
      if(localMode){localState.drawings={...(localState.drawings||{}),[index]:drawing};roomData=localState;renderGame();}
      else {await roomRef.child("drawings/"+index).set(drawing);}
      say("guessDrawingStatus","വരച്ച അക്ഷരം അയച്ചു. ടീം പരിശോധിക്കുന്നതിനായി കാത്തിരിക്കൂ.");
    } catch(e){console.error(e);toast("വരച്ച അക്ഷരം അയയ്ക്കാനായില്ല.");}
  }
  async function resetDrawing(index){
    if(!isMyTurnToGuess()||roomData.finished)return;
    const drawings={...(roomData.drawings||{})}, marks={...(roomData.marks||{})};
    delete drawings[index];delete marks[index];
    if(localMode){localState.drawings=drawings;localState.marks=marks;roomData=localState;renderGame();}
    else {
      // Remove the mark first so rules can verify the player owns the drawing.
      await roomRef.child("marks/"+index).remove();
      await roomRef.child("drawings/"+index).remove();
    }
  }
  async function judgeDrawing(index,correct,chosenLetter=null) {
    if(!isHost||!roomData?.puzzle||roomData.finished)return;
    const drawings={...(roomData.drawings||{})}, marks={...(roomData.marks||{})};
    if(!drawings[index]||marks[index])return;
    const target=chosenLetter;
    if(correct&&!target){toast("ശരിയായ മലയാളം അക്ഷരം തിരഞ്ഞെടുക്കൂ.");return;}
    if(correct){
      marks[index]="correct";
      const mask=Array.from(roomData.puzzle.mask||"");
      mask[index]=target||mask[index];
      const won=!mask.includes("_");
      const finished=won;
      const winner=won?(1-roomData.puzzle.creatorTeam):null;
      const scores={...(roomData.scores||{0:0,1:0})};
      if(won)scores[winner]=(scores[winner]||0)+1;
      await updateRoom({marks,placements:{...(roomData.placements||{}),[index]:target},puzzle:{...roomData.puzzle,mask:mask.join("")},finished,winner,scores});
      toast(won?"എല്ലാ അക്ഷരങ്ങളും ശരി! ടീം വിജയിച്ചു!":"പച്ച ✓ അടയാളപ്പെടുത്തി — ശരിയായ അക്ഷരം തുറന്നു.");
    } else {
      marks[index]="wrong";
      const wrong=(roomData.wrong||0)+1, finished=wrong>=5, winner=finished?roomData.puzzle.creatorTeam:null;
      const scores={...(roomData.scores||{0:0,1:0})};
      if(finished)scores[winner]=(scores[winner]||0)+1;
      await updateRoom({marks,wrong,finished,winner,scores});
      toast(finished?"അഞ്ച് തെറ്റുകൾ! റൗണ്ട് അവസാനിച്ചു.":"ചുവപ്പ് ✕ അടയാളപ്പെടുത്തി — തെറ്റായ അക്ഷരം.");
    }
  }
  function openLetterPicker(index){
    const grid=$("letterPickerGrid");grid.innerHTML="";
    MALAYALAM.forEach(ch=>{
      const button=document.createElement("button");button.type="button";button.className="letter-picker-button";button.textContent=ch;
      button.addEventListener("click",async()=>{$("letterPickerDialog").close();await judgeDrawing(index,true,ch);});
      grid.appendChild(button);
    });
    $("letterPickerDialog").dataset.index=String(index);
    $("letterPickerDialog").showModal();
  }
  $("closeLetterPicker").addEventListener("click",()=>$("letterPickerDialog").close());
  async function nextRound() {
    if(!isHost)return;
    const next=(roomData.round||1)+1;
    await updateRoom({round:next,puzzle:null,guesses:{},placements:{},drawings:{},marks:{},chat:[],wrong:0,finished:false,winner:null});
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

  function initAnswerKeyboard(){
    const keyboard=$("answerKeyboard");if(!keyboard)return;
    [...MALAYALAM,...SIGNS].forEach(ch=>{
      const b=document.createElement("button");b.type="button";b.className="answer-key";b.textContent=ch;
      b.addEventListener("click",()=>{const input=$("movieAnswer");if(graphemes(input.value).length>=50){toast("സിനിമയുടെ പേര് കുറച്ച് ചുരുക്കൂ.");return;}input.value+=ch;});
      keyboard.appendChild(b);
    });
    $("answerSpace").addEventListener("click",()=>{const input=$("movieAnswer");if(input.value&&!input.value.endsWith(" "))input.value+=" ";});
    $("answerBackspace").addEventListener("click",()=>{const input=$("movieAnswer");input.value=graphemes(input.value).slice(0,-1).join("");});
    $("answerClear").addEventListener("click",()=>{$("movieAnswer").value="";});
  }
  initAnswerKeyboard();
  // Team A draws a public clue made of dashes and symbols; it is not OCR-processed.
  let clueHasInk=false;
  function initClueCanvas(){
    const canvas=$("clueCanvas");if(!canvas)return;
    const ctx=canvas.getContext("2d");
    const clear=()=>{ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);};
    clear();
    let drawing=false,last=null;
    canvas.addEventListener("pointerdown",e=>{
      e.preventDefault();canvas.setPointerCapture(e.pointerId);drawing=true;clueHasInk=true;
      const r=canvas.getBoundingClientRect();last={x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};
      ctx.beginPath();ctx.arc(last.x,last.y,3,0,Math.PI*2);ctx.fillStyle="#20172d";ctx.fill();
    });
    canvas.addEventListener("pointermove",e=>{
      if(!drawing)return;e.preventDefault();
      const r=canvas.getBoundingClientRect(),p={x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};
      ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.strokeStyle="#20172d";ctx.lineWidth=7;ctx.lineCap="round";ctx.lineJoin="round";ctx.stroke();last=p;
    });
    const stop=()=>{drawing=false;last=null;};canvas.addEventListener("pointerup",stop);canvas.addEventListener("pointercancel",stop);
    $("clearClueCanvas").addEventListener("click",()=>{clear();clueHasInk=false;});
  }
  initClueCanvas();
  // Draw directly into each blank; no automatic handwriting recognition.
  function initSlotCanvas(canvas){
    const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
    let drawing=false,last=null;
    canvas.addEventListener("pointerdown",e=>{e.preventDefault();e.stopPropagation();selectedGuessIndex=Number(canvas.dataset.index);$("selectedSlotLabel").textContent="സ്ഥാനം "+(selectedGuessIndex+1);canvas.setPointerCapture(e.pointerId);drawing=true;const r=canvas.getBoundingClientRect();last={x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};ctx.beginPath();ctx.arc(last.x,last.y,3,0,Math.PI*2);ctx.fillStyle="#20172d";ctx.fill();});
    canvas.addEventListener("pointermove",e=>{if(!drawing)return;e.preventDefault();e.stopPropagation();const r=canvas.getBoundingClientRect(),p={x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.strokeStyle="#20172d";ctx.lineWidth=6;ctx.lineCap="round";ctx.lineJoin="round";ctx.stroke();last=p;});
    const stop=()=>{drawing=false;last=null;};canvas.addEventListener("pointerup",stop);canvas.addEventListener("pointercancel",stop);
  }
  $("sendDrawing").addEventListener("click",()=>guessLetter("",selectedGuessIndex));
  $("clearGuessCanvas").addEventListener("click",()=>{
    const pad=document.querySelector(`.slot-draw-canvas[data-index="${selectedGuessIndex}"]`);
    if(pad){const ctx=pad.getContext("2d");ctx.clearRect(0,0,pad.width,pad.height);ctx.fillStyle="#fff";ctx.fillRect(0,0,pad.width,pad.height);}
    say("guessDrawingStatus","തിരഞ്ഞെടുത്ത ഡാഷ് മായ്ച്ചു.");
  });
  function renderChat(messages){
    const box=$("chatMessages");if(!box)return;
    let list=messages||[];
    if(!Array.isArray(list))list=Object.values(list);
    box.innerHTML="";
    if(!list.length){const p=document.createElement("p");p.className="chat-empty";p.textContent="സന്ദേശങ്ങളൊന്നുമില്ല. ആദ്യം ഒരു സന്ദേശം അയയ്ക്കൂ.";box.appendChild(p);return;}
    list.slice(-80).forEach(m=>{
      if(!m)return;
      const item=document.createElement("div");item.className="chat-message"+(m.uid===uid?" mine":"");
      const meta=document.createElement("div");meta.className="chat-meta";meta.textContent=(m.name||"കളിക്കാരൻ")+" · "+new Date(m.at||Date.now()).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
      const body=document.createElement("p");body.textContent=m.text||"";
      item.append(meta,body);box.appendChild(item);
    });
    box.scrollTop=box.scrollHeight;
  }
  async function sendChatMessage(event){
    event?.preventDefault();
    const text=normalize($("chatInput").value);if(!text)return;
    const message={uid,name:myPlayer()?.name||myName||"കളിക്കാരൻ",text,at:Date.now()};
    try{
      if(localMode){
        localState.chat=[...(localState.chat||[]),message].slice(-80);renderChat(localState.chat);
      }else{await roomRef.child("chat").push(message);}
      $("chatInput").value="";
    }catch(e){console.error(e);toast("സന്ദേശം അയയ്ക്കാനായില്ല.");}
  }
  $("chatForm").addEventListener("submit",sendChatMessage);

  $("playerName").value="";
  if(!firebaseReady) $("connectionBadge").textContent="ഡെമോ മോഡ്";
})();