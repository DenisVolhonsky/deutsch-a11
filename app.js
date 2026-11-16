'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>String(n).padStart(2,'0');
const colorArticles=(s)=>esc(s).replace(/\b(der|die|das|den|dem|des)\b/gi,(m)=>`<span class="article article-${m.toLowerCase()}">${m}</span>`);
const key=(w,dir=direction())=>w.id+':'+dir;
const cardKey=item=>key(item.w,item.dir);
let lessons=[],categories=[],words=[],grammar=[],queue=[],pos=0,activeGrammar=null,organization='categories',currentBrowse='';
let sessionGrades=new Set(), priorRatings=new Map(), suppressCardClick=false;
let progress={};const save=()=>ProgressStore.save(progress).catch(err=>{console.error(err);alert('Не удалось сохранить прогресс. Экспортируй резервную копию.');});
const categoryMap=()=>Object.fromEntries(categories.map(x=>[x.id,x]));
function getEntries(filter){if(filter.startsWith('lesson:'))return words.filter(w=>w.lesson===Number(filter.slice(7)));if(filter.startsWith('cat:'))return words.filter(w=>(w.categories||[]).includes(filter.slice(4)));return words;}
function known(w){return ['de-ru','ru-de'].every(d=>{const p=progress[key(w,d)];return Boolean(p&&(p.last==='good'||p.last==='easy')&&p.stability>=2)})}
function topicStats(items){const total=items.length,learned=items.filter(known).length,started=items.filter(w=>Boolean(progress[w.id+':de-ru']||progress[w.id+':ru-de'])).length;return {total,learned,started,percentage:total?Math.round(learned*100/total):0}}
function renderCategoryRow(name,desc,filter,items,icon='▣',action='browse'){const s=topicStats(items);return `<button class="categoryRow" data-${action}="${esc(filter)}"><span class="catIcon">${icon}</span><span class="catBody"><b>${esc(name)}</b><small>${esc(desc)} · ${s.learned} из ${s.total} запомнил</small><span class="progressTrack smallTrack"><span class="progressFill" style="width:${s.percentage}%"></span></span></span><span class="catPct">${s.percentage}%<span>›</span></span></button>`}
function categoryRows(mode){if(mode==='lessons')return lessons.map(l=>renderCategoryRow(fmt(l.number)+'. '+l.de,l.ru,'lesson:'+l.number,getEntries('lesson:'+l.number),'▤')).join('');return categories.map(c=>renderCategoryRow(c.de,c.ru,'cat:'+c.id,getEntries('cat:'+c.id),'▣')).join('')}
function attachCategoryActions(root){root.querySelectorAll('[data-browse]').forEach(b=>b.onclick=()=>openBrowse(b.dataset.browse));root.querySelectorAll('[data-learn]').forEach(b=>b.onclick=()=>openStudy(b.dataset.learn))}
function showTab(tab){document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===tab));document.querySelectorAll('.navItem').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));window.scrollTo({top:0,behavior:'instant'});if(tab==='stats')drawStats();if(tab==='home')drawHome();}
function drawHome(){let due=0,fresh=0,now=Date.now();for(let w of words)for(const dir of ['de-ru','ru-de']){let p=progress[key(w,dir)];if(!p)fresh++;else if(Date.parse(p.due)<=now)due++} $('dashDue').textContent=due;$('dashNew').textContent=fresh;$('todayDate').textContent=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short'}).format(new Date());const ranked=categories.map(c=>({...c,stats:topicStats(getEntries('cat:'+c.id))})).sort((a,b)=>a.stats.percentage-b.stats.percentage).slice(0,7);$('homeCategories').innerHTML=ranked.map(c=>renderCategoryRow(c.de,c.ru,'cat:'+c.id,getEntries('cat:'+c.id))).join('');attachCategoryActions($('homeCategories'))}
function fillFilters(){let sel=$('studyFilter');sel.add(new Option('Все слова и выражения','all'));let ls=document.createElement('optgroup');ls.label='УРОКИ';for(let x of lessons)ls.append(new Option(fmt(x.number)+'. '+x.de+' — '+x.ru,'lesson:'+x.number));sel.append(ls);let cs=document.createElement('optgroup');cs.label='ТЕМЫ';for(let x of categories)cs.append(new Option(fmt(x.order)+'. '+x.de+' — '+x.ru,'cat:'+x.id));sel.append(cs)}
function openStudy(filter){$('studyFilter').value=filter;$('studyMode').value='all';showTab('study');selectQueue()}
function drawBrowseList(){let root=$('browseCategoryList');$('wordBrowser').hidden=true;root.hidden=false;document.querySelectorAll('.segment').forEach(b=>b.classList.toggle('active',b.dataset.organization===organization));root.innerHTML=organization==='all'?renderCategoryRow('Все слова и выражения','Полный учебный список','all',words,'▤'):categoryRows(organization);attachCategoryActions(root);if(organization==='all')openBrowse('all')}
function openBrowse(filter){currentBrowse=filter;let caption='Все слова';if(filter.startsWith('cat:')){let c=categories.find(x=>x.id===filter.slice(4));caption=c?c.de+' — '+c.ru:caption}if(filter.startsWith('lesson:')){let l=lessons.find(x=>x.number===Number(filter.slice(7)));caption=l?fmt(l.number)+'. '+l.de+' — '+l.ru:caption}$('browseTitle').textContent=caption;$('browseCategoryList').hidden=true;$('wordBrowser').hidden=false;$('search').value='';drawVocab()}
function drawVocab(){let q=$('search').value.toLocaleLowerCase().trim(),items=getEntries(currentBrowse||'all').filter(w=>(w.de+' '+w.ru+' '+w.example).toLocaleLowerCase().includes(q));$('vocabCount').textContent=items.length+' слов';$('wordList').innerHTML=items.map(w=>`<div class="word"><div><strong>${colorArticles(w.de)}</strong><small>${colorArticles(w.example||'')}${w.verb?' · '+esc(w.verb.er||'')+' · '+esc(w.verb.perfekt||''):''}</small></div><span class="ru">${esc(w.ru)}</span></div>`).join('')||'<p class="muted">Слова не найдены.</p>'}
function direction(){return $('direction').value}
function selectQueue(){
  const all=getEntries($('studyFilter').value),mode=$('studyMode').value,now=Date.now();
  const directions=direction()==='both'?['de-ru','ru-de']:[direction()];
  let candidates=[];
  for(const w of all)for(const dir of directions){
    const p=progress[key(w,dir)];
    if(mode==='due' && (!p||Date.parse(p.due)>now))continue;
    if(mode==='new' && p)continue;
    candidates.push({w,dir});
  }
  // Avoid immediate reverse-direction hinting: interleave directions by word.
  if(direction()==='both')candidates.sort((a,b)=>a.dir.localeCompare(b.dir));
  queue=candidates;pos=0;sessionGrades.clear();priorRatings.clear();drawCard();
}
function updateCardNav(){const has=queue.length>0;$('prevCard').disabled=!has||pos<=0;$('nextCard').disabled=!has||pos>=queue.length-1;$('navHint').textContent=has?'Свайп: ← далее · назад →':'Выбери слова для тренировки'}
function navigateCard(step){if(!queue.length)return;const next=pos+step;if(next<0||next>=queue.length)return;pos=next;drawCard(false);const card=$('flashCard');card.classList.remove('swipeToLeft','swipeToRight');void card.offsetWidth;card.classList.add(step>0?'swipeToLeft':'swipeToRight')}
function imgFor(w){return w.image||null}
let gradedAnimation=false;
function drawCard(anim=false){let item=queue[pos],w=item?.w;updateCardNav();$('studyCount').textContent=queue.length?`${pos+1} из ${queue.length}`:'Нет карточек';$('studyCategoryProgress').textContent=queue.length?Math.round(pos/queue.length*100)+'% просмотрено':'';$('studyProgressBar').style.width=queue.length?((pos/queue.length)*100)+'%':'0%';$('answer').hidden=true;$('grading').hidden=true;$('cardFoot').hidden=false;const card=$('flashCard');card.classList.remove('isRevealed','flyNext');if(anim){void card.offsetWidth;card.classList.add('flyNext')}if(!w){$('front').textContent='Здесь пока нет карточек';$('frontExample').textContent='Выбери другую категорию или режим';$('picture').hidden=true;$('imageFallback').hidden=true;$('showAnswer').disabled=true;return}$('showAnswer').disabled=false;let image=imgFor(w);$('picture').hidden=!image;$('imageFallback').hidden=!!image;if(image){$('picture').src=image;$('picture').alt='Изображение для '+w.de}else{$('imageFallback').textContent=categoryFallback(w)}let reverse=item.dir==='ru-de';$('front').innerHTML=reverse?esc(w.ru):colorArticles(w.de);$('frontExample').innerHTML=reverse?esc(w.exampleRu||''):colorArticles(w.example||'');$('cardKind').textContent=w.verb?'ГЛАГОЛ':w.de.trim().includes(' ')?'ВЫРАЖЕНИЕ':'СЛОВО';$('cardNumber').textContent=`Урок ${w.lesson||'—'} · ${item.dir==='de-ru'?'DE → RU':'RU → DE'}`}
function categoryFallback(w){let c=(w.categories||[])[0];let icons={familie:'♧',verkehr:'▰',essen:'◈',koerper:'♡',gesund:'✚',wetter:'☀',strong:'↻',modal:'◇',adjektive:'✦',wohnen:'⌂',regular:'↻',wfragen:'?',kleidung:'◉',freizeit:'☆'};return icons[c]||'DE'}
function showAnswer(){let item=queue[pos],w=item?.w;if(!w)return;const rev=item.dir==='ru-de';const forms=w.verb?`<div class="verbForms"><div><span>Инфинитив</span><b>${colorArticles(w.de)}</b></div><div><span>er / sie / es</span><b>${esc(w.verb.er||'—')}</b></div><div><span>Perfekt</span><b>${esc(w.verb.perfekt||'—')}</b></div></div>`:'';$('answer').innerHTML=`<div class="revealedWord">${rev?colorArticles(w.de):esc(w.ru)}</div>${forms}<div class="example"><b>${colorArticles(w.example||'')}</b><small>${esc(w.exampleRu||'')}</small></div>`;$('answer').hidden=false;$('cardFoot').hidden=true;$('grading').hidden=false;$('flashCard').classList.add('isRevealed')}
function grade(value){
  const item=queue[pos],w=item?.w;if(!w)return;
  const k=cardKey(item);
  // Regrading a previously visited card replaces its earlier rating rather than double-counting.
  if(!priorRatings.has(k))priorRatings.set(k,progress[k]?structuredClone(progress[k]):null);
  const previous=priorRatings.get(k);
  progress[k]=FSRS.review(previous?.algorithm==='FSRS-4.5'?previous:null,value);
  sessionGrades.add(k);save();
  if(pos<queue.length-1)navigateCard(1);
  else {drawCard();$('navHint').textContent='Последняя карточка · можно вернуться назад';}
}

function grammarResults(){let q=$('grammarSearch').value.toLocaleLowerCase().trim(),s=$('grammarSection').value;return grammar.filter(g=>(s==='all'||g.section===s)&&(!q||(g.title+' '+g.intro+' '+g.section).toLocaleLowerCase().includes(q)))}
function drawGrammarList(){let gs=grammarResults();if(!gs.some(g=>g.id===activeGrammar))activeGrammar=gs[0]?.id;$('topicList').innerHTML=gs.map(g=>`<button data-grammar="${esc(g.id)}" class="${g.id===activeGrammar?'active':''}">${esc(g.title)}<span>›</span></button>`).join('');$('topicList').querySelectorAll('button').forEach(b=>b.onclick=()=>{activeGrammar=b.dataset.grammar;drawGrammarList();if(window.innerWidth<720)$('grammarArticle').scrollIntoView({behavior:'smooth',block:'start'})});drawGrammarArticle()}
function drawGrammarArticle(){let g=grammar.find(g=>g.id===activeGrammar);if(!g){$('grammarArticle').innerHTML='<p>Нет подходящих правил.</p>';return}let tab=g.table?`<div class="tableScroll"><table class="gramTable"><thead><tr>${g.table.columns.map(c=>'<th>'+esc(c)+'</th>').join('')}</tr></thead><tbody>${g.table.rows.map(row=>'<tr>'+row.map(v=>'<td>'+colorArticles(v)+'</td>').join('')+'</tr>').join('')}</tbody></table></div>`:'';let examples=(g.examples||[]).map(x=>`<div class="gramExample"><b>${colorArticles(x.de)}</b><span>${esc(x.ru)}</span></div>`).join('');$('grammarArticle').innerHTML=`<div class="eyebrow">${esc(g.section)} · ${esc(g.level||'A1')}</div><h2>${esc(g.title)}</h2><p>${esc(g.intro)}</p>${tab}${g.note?'<div class="grammarNote"><b>Запомни</b><p>'+esc(g.note)+'</p></div>':''}<h3>Примеры</h3><div class="examples">${examples}</div>${g.practice?`<div class="exercise"><b>Попробуй сам</b><p>${esc(g.practice.q)}</p><button id="grammarReveal" class="secondary">Показать ответ</button><p id="solution" hidden>${colorArticles(g.practice.a)}</p></div>`:''}`;let b=$('grammarReveal');if(b)b.onclick=()=>{$('solution').hidden=false}}
function drawStats(){let records=Object.values(progress);let learned=records.filter(x=>x.last==='good'||x.last==='easy').length;let due=records.filter(x=>Date.parse(x.due)<=Date.now()).length;$('statsCards').innerHTML=`<div class="stat"><strong>${words.length}</strong><span>Слов в базе</span></div><div class="stat"><strong>${records.length}</strong><span>Карточек изучено</span></div><div class="stat"><strong>${learned}</strong><span>Успешных ответов</span></div><div class="stat"><strong>${due}</strong><span>Пора повторить</span></div>`;$('statsCategories').innerHTML=categoryRows('categories');$('statsLessons').innerHTML=categoryRows('lessons');for(let x of ['statsCategories','statsLessons'])attachCategoryActions($(x))}
async function exportBackup(){try{await ProgressStore.exportFile(progress)}catch(e){alert('Не удалось экспортировать: '+e.message)}}
async function importBackup(e){
  const f=e.target.files?.[0];if(!f)return;
  try{
    const restored=ProgressStore.parseBackup(await f.text());
    const replace=confirm('Нажми ОК, чтобы ЗАМЕНИТЬ локальный прогресс резервной копией. Нажми Отмена, чтобы ОБЪЕДИНИТЬ, сохранив более новые ответы.');
    const merged=replace?restored:{...progress};
    if(!replace)for(const [k,v] of Object.entries(restored)){
      if(!merged[k]||Date.parse(v.lastReview)>Date.parse(merged[k].lastReview))merged[k]=v;
    }
    await ProgressStore.save(merged);progress=merged;drawHome();drawStats();selectQueue();
    alert('Прогресс восстановлен: '+Object.keys(restored).length+' карточек.');
  }catch(err){alert('Ошибка импорта: '+err.message)}finally{e.target.value=''}
}
async function restoreLocalBackup(){
  try{const copy=await ProgressStore.restoreLastSnapshot();if(!copy){alert('Локальных снимков пока нет');return;}
    if(!confirm('Восстановить последний локальный снимок? Текущие изменения могут быть потеряны.'))return;
    await ProgressStore.save(copy);progress=copy;drawHome();drawStats();selectQueue();alert('Снимок восстановлен');
  }catch(e){alert('Ошибка восстановления: '+e.message)}
}

function init(){fillFilters();for(let b of document.querySelectorAll('.navItem'))b.onclick=()=>showTab(b.dataset.tab);document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>showTab(b.dataset.go));$('startToday').onclick=()=>{$('studyFilter').value='all';$('studyMode').value='due';selectQueue();if(!queue.length){$('studyMode').value='new';selectQueue()}showTab('study')};document.querySelectorAll('.segment').forEach(b=>b.onclick=()=>{organization=b.dataset.organization;drawBrowseList()});$('browseBack').onclick=()=>drawBrowseList();$('studyFilter').onchange=selectQueue;$('studyMode').onchange=selectQueue;$('direction').onchange=selectQueue;$('showAnswer').onclick=showAnswer;$('prevCard').onclick=()=>navigateCard(-1);$('nextCard').onclick=()=>navigateCard(1);$('flashCard').addEventListener('click',e=>{if(e.target.closest('button')||suppressCardClick)return;if($('answer').hidden)showAnswer()});$('flashCard').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target===$('flashCard')){e.preventDefault();if($('answer').hidden)showAnswer()}});// Horizontal touch gestures navigate; vertical page scrolling and button taps remain native.
  let touchStart=null;
  const cardEl=$('flashCard');
  cardEl.addEventListener('touchstart',e=>{if(e.touches.length!==1||e.target.closest('button')){touchStart=null;return;}const t=e.touches[0];touchStart={x:t.clientX,y:t.clientY};},{passive:true});
  cardEl.addEventListener('touchend',e=>{if(!touchStart||e.changedTouches.length!==1)return;const t=e.changedTouches[0],dx=t.clientX-touchStart.x,dy=t.clientY-touchStart.y;touchStart=null;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.4){suppressCardClick=true;navigateCard(dx<0?1:-1);setTimeout(()=>{suppressCardClick=false},350)}},{passive:true});
  cardEl.addEventListener('touchcancel',()=>{touchStart=null},{passive:true});
  document.querySelectorAll('[data-grade]').forEach(b=>b.onclick=()=>grade(b.dataset.grade));$('search').oninput=drawVocab;let secs=[...new Set(grammar.map(x=>x.section))];$('grammarSection').add(new Option('Все разделы','all'));for(let s of secs)$('grammarSection').add(new Option(s,s));$('grammarSection').onchange=drawGrammarList;$('grammarSearch').oninput=drawGrammarList;const theme=localStorage.getItem('deutsch-theme')||'system';document.documentElement.dataset.theme=theme;$('theme').onclick=()=>{let t=document.documentElement.dataset.theme||'system';document.documentElement.dataset.theme=t==='system'?'light':t==='light'?'dark':'system';localStorage.setItem('deutsch-theme',document.documentElement.dataset.theme)};$('export').onclick=exportBackup;$('import').onchange=importBackup;$('restoreLocal').onclick=restoreLocalBackup;drawBrowseList();drawGrammarList();selectQueue();drawStats();drawHome();}
(async()=>{try{progress=await ProgressStore.init();await ProgressStore.pruneSnapshots();[lessons,categories,words,grammar]=await Promise.all(['lessons','categories','vocabulary','grammar'].map(n=>fetch('./data/'+n+'.json').then(r=>{if(!r.ok)throw Error(n+': '+r.status);return r.json()})));init()}catch(e){$('front').textContent='Ошибка загрузки: '+e.message;console.error(e)}})();
