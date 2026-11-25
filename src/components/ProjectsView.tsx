import React,{useEffect,useId,useMemo,useState} from 'react';
import type {Task} from '../types';
import type {Project,TaskTemplate} from '../domain/planning';
import {localDate,normalizeText} from '../domain/planning';
import {createEntityId} from '../domain/models';
import {usePlanning} from '../app/PlanningContext';
import {taskRevisionSnapshot} from '../utils/scheduleView';
import {domainEntityToTask,usePlatform} from '../app/PlatformContext';
import {copyTask,instantiateTemplate} from '../utils/planningEngine';
import {projectStageGroups,taskProgress} from '../utils/projectStages';
import {Field,PlanningShell} from './PlanningShared';

const uid=()=>createEntityId('plan');
const builtins:TaskTemplate[]=[
 {id:'study',title:'جلسهٔ مطالعه',tasks:[{id:'review',title:'مرور مطالب قبلی',duration:15,priority:1,category:'learning'},{id:'read',title:'مطالعهٔ بخش جدید',duration:40,priority:2,category:'learning'},{id:'practice',title:'تمرین و جمع‌بندی',duration:20,priority:3,category:'learning'}]},
 {id:'personal-project',title:'شروع پروژهٔ شخصی',tasks:[{id:'define',title:'تعریف نتیجهٔ مورد انتظار',duration:20,priority:1,category:'work'},{id:'prototype',title:'ساخت اولین نمونه',duration:60,priority:2,category:'work'},{id:'revise',title:'بررسی و اصلاح',duration:30,priority:3,category:'work'}]},
];
function Progress({tasks}:{tasks:Task[]}) {
 const p=taskProgress(tasks);
 return p.total?<><progress value={p.completed} max={p.total}/><p>{p.completed.toLocaleString('fa-IR')} از {p.total.toLocaleString('fa-IR')} کار — {p.percent?.toLocaleString('fa-IR')}٪</p></>:<p>هنوز کاری ثبت نشده است.</p>;
}
function StageEditor({project,stage,index,tasks,onRemove,onMove,onRename,busy}:{project:Project;stage:Project['stages'][number];index:number;tasks:Task[];onRemove:(destination:string)=>Promise<void>;onMove:(direction:number)=>void;onRename:(title:string)=>Promise<boolean>;busy:boolean}) {
 const [title,setTitle]=useState(stage.title),[confirm,setConfirm]=useState(false),[destination,setDestination]=useState('');
 useEffect(()=>setTitle(stage.title),[stage.title]);
 return <article className="kp-card"><div className="kp-actions"><Field label={`نام مرحله ${stage.title}`}><input value={title} onChange={e=>setTitle(e.target.value)}/></Field><button disabled={busy||!title.trim()||title===stage.title} onClick={()=>void onRename(title.trim())}>ذخیرهٔ نام مرحله</button><button aria-label={`مرحله ${stage.title} بالاتر`} disabled={busy||index===0} onClick={()=>onMove(-1)}>↑</button><button aria-label={`مرحله ${stage.title} پایین‌تر`} disabled={busy||index===project.stages.length-1} onClick={()=>onMove(1)}>↓</button><button disabled={busy} onClick={()=>setConfirm(!confirm)}>حذف مرحله</button></div><Progress tasks={tasks}/>{confirm&&<div className="kp-card"><p>خود کارها حذف نمی‌شوند.</p>{tasks.length>0&&<Field label="کارهای این مرحله به کجا منتقل شوند؟"><select value={destination} onChange={e=>setDestination(e.target.value)}><option value="">انتخاب کن</option><option value="__none">خارج‌کردن از مرحله</option>{project.stages.filter(s=>s.id!==stage.id).map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></Field>}<div className="kp-actions"><button disabled={busy||(tasks.length>0&&!destination)} onClick={()=>void onRemove(destination||'__none')}>تأیید انتقال کارها و حذف مرحله</button><button disabled={busy} onClick={()=>setConfirm(false)}>انصراف</button></div></div>}</article>;
}
export function ProjectsView({
 tasks, selectedProjectId, onSelectProject, onEdit, onAdd, onSaveTasks, onUpdateTask, onToggle
}: {
 tasks: Task[];
 selectedProjectId: string;
 onSelectProject: (id: string) => void;
 onEdit: (id: string) => void;
 onAdd: (projectId: string) => void;
 onSaveTasks: (tasks: Task[]) => Promise<boolean>;
 onUpdateTask: (task: Task) => Promise<boolean>;
 onToggle: (id: string) => void;
}) {
 const {state,change,refresh}=usePlanning();const {container}=usePlatform();
 const [query,setQuery]=useState(''),[status,setStatus]=useState('all'),[stageFilter,setStageFilter]=useState('all'),[due,setDue]=useState('');
 const [title,setTitle]=useState(''),[description,setDescription]=useState(''),[stageTitle,setStageTitle]=useState(''),[includeArchived,setIncludeArchived]=useState(false);
 const [template,setTemplate]=useState<TaskTemplate|null>(null),[templateDate,setTemplateDate]=useState(()=>localDate(new Date())),[templateName,setTemplateName]=useState(''),[removeTemplate,setRemoveTemplate]=useState('');
 const [saving,setSaving]=useState(false),[message,setMessage]=useState('');
 const [addingSubproject, setAddingSubproject] = useState(false);
 const [subprojectParentId, setSubprojectParentId] = useState('');
 const [subprojectTitle, setSubprojectTitle] = useState('');
 const subprojectFormId = useId();
 const project = state.projects.find(p => p.id === selectedProjectId);
 const selected = project?.id ?? '';
 const parent = state.projects.find(p => p.id === project?.parentProjectId);
 const eligibleParents = state.projects.filter(p => !p.parentProjectId && !p.archived);
 const subprojectParent = eligibleParents.find(p => p.id === subprojectParentId);
 const subprojects = project ? state.projects.filter(p => p.parentProjectId === project.id) : [];
 const tasksByProject = useMemo(() => {
   const grouped = new Map<string, Task[]>();
   for (const task of tasks) {
     if (!task.projectId || task.deletedAt) continue;
     const group = grouped.get(task.projectId);
     if (group) group.push(task);
     else grouped.set(task.projectId, [task]);
   }
   return grouped;
 }, [tasks]);
 const projectLabel = (item: Project) => {
   const owner = item.parentProjectId && state.projects.find(p => p.id === item.parentProjectId);
   return (owner ? owner.title + ' / ' : '') + item.title + (item.archived ? ' (بایگانی)' : '');
 };
 useEffect(()=>{setTitle(project?.title??'');setDescription(project?.description??'');},[selected,project?.title,project?.description]);
 useEffect(() => {
   setStageFilter('all');
   setAddingSubproject(false);
   setSubprojectTitle('');
 }, [selected]);
 const knownStages=new Set(project?.stages.map(s=>s.id));
 const filtered=tasks.filter(t=>!t.deletedAt&&(!selected||t.projectId===selected)&&normalizeText(t.title+' '+(state.projects.find(p=>p.id===t.projectId)?.title??'')).includes(normalizeText(query))&&(status==='all'||(status==='done'?t.completed:status==='archived'?t.status==='archived':!t.completed&&t.status!=='archived'))&&(!due||(t.dueAt&&localDate(new Date(t.dueAt))<=due))&&(!selected||stageFilter==='all'||(stageFilter==='__none'?(!t.planning?.stageId||!knownStages.has(t.planning.stageId)):t.planning?.stageId===stageFilter)));
 const own = tasksByProject.get(selected) ?? [];
 const progressTasks = [...own, ...subprojects.flatMap(child => tasksByProject.get(child.id) ?? [])];
 const createSubproject = async (event: React.FormEvent) => {
   event.preventDefault();
   const childTitle = subprojectTitle.trim();
   if (!subprojectParent || !childTitle) return;
   const id = uid();
   const parentProjectId = subprojectParent.id;
   if (await change(draft => {
     draft.projects.push({ id, parentProjectId, title: childTitle, description: '', archived: false, stages: [] });
   })) {
     setAddingSubproject(false);
     setSubprojectTitle('');
     onSelectProject(id);
   }
 };
 const create=async(e:React.FormEvent)=>{e.preventDefault();if(!title.trim())return;const id=project?.id??uid();if(await change(s=>{if(project){const p=s.projects.find(x=>x.id===id)!;p.title=title.trim();p.description=description;}else s.projects.push({id,title:title.trim(),description,archived:false,stages:[]});}))onSelectProject(id);};
 const removeStage = async (stageId: string, destination: string) => {
   if (!project || saving) return;
   setSaving(true);
   setMessage('');
   try {
     const affected = own.filter(task => task.planning?.stageId === stageId);
     for (const task of affected) {
       const stageId = destination === '__none' ? undefined : destination;
       if (!await onUpdateTask({...task, planning: {...task.planning, stageId}})) {
         setMessage('انتقال کامل نشد. مرحله حفظ شد و کارهای منتقل‌شده در مقصد باقی ماندند.');
         return;
       }
     }
     const [fresh, entities] = await Promise.all([container.planning.getPlanning(), container.tasks.listTasks()]);
     const activeTasks = entities.map(domainEntityToTask).filter(task => !task.deletedAt);
     const owner = fresh.projects.find(item => item.id === project.id);
     if (!owner?.stages.some(stage => stage.id === stageId) ||
         (destination !== '__none' && !owner.stages.some(stage => stage.id === destination))) {
       throw Error('مرحلهٔ مبدأ یا مقصد تغییر کرده است. انتقال را دوباره بررسی کن.');
     }
     if (activeTasks.some(task => task.projectId === project.id && task.planning?.stageId === stageId)) {
       throw Error('کار تازه‌ای به این مرحله وصل شده است. فهرست کارها را دوباره بررسی کن.');
     }
     const projects = fresh.projects.map(item => item.id === owner.id
       ? {...item, stages: item.stages.filter(stage => stage.id !== stageId)}
       : item);
     await container.planning.savePlanning({...fresh, projects, revision: fresh.revision + 1}, {
       expectedRevision: fresh.revision, expectedTaskRevisions: taskRevisionSnapshot(activeTasks),
     });
     setStageFilter('all');
     setMessage('مرحله حذف شد و کارها حفظ شدند.');
   } catch (error) {
     setMessage((error as Error).message);
   } finally {
     await refresh();
     setSaving(false);
   }
 };
 const copy=async(t:Task)=>{if(!templateDate||saving)return;setSaving(true);try{if(await onSaveTasks([copyTask(t,templateDate)]))setMessage('کپی کار با شناسه و سابقهٔ تازه ساخته شد.');}finally{setSaving(false);}};
 const useTemplate=async()=>{if(!template||saving)return;setSaving(true);try{if(await onSaveTasks(instantiateTemplate(template,templateDate,selected||undefined))){setTemplate(null);setMessage('کارهای قالب ساخته شدند.');}}finally{setSaving(false);}};
 const renderTask=(t:Task)=><article className="kp-card" key={t.id}><div className="kp-actions"><input aria-label={`انجام ${t.title}`} type="checkbox" checked={t.completed} onChange={()=>onToggle(t.id)}/><button className="kp-link" onClick={()=>onEdit(t.id)}>{t.title}</button><small>{state.projects.find(p=>p.id===t.projectId)?.title}</small><button disabled={saving||!templateDate} onClick={()=>void copy(t)}>کپی برای تاریخ انتخابی</button></div>{t.planning?.resume&&<p>از اینجا ادامه بده: {t.planning.resume}</p>}{project&&<Field label={`مرحلهٔ کار ${t.title}`}><select disabled={saving} value={knownStages.has(t.planning?.stageId??'')?t.planning?.stageId:''} onChange={async e=>{const stageId=e.target.value;setSaving(true);try{await onUpdateTask({...t,planning:{...t.planning,stageId:stageId||undefined}});}finally{setSaving(false);}}}><option value="">بدون مرحله</option>{project.stages.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></Field>}<small>{t.planning?.waiting?'در انتظار · ':''}{t.duration.toLocaleString('fa-IR')} دقیقه</small></article>;
 const groups=project?projectStageGroups(project,filtered):null;
 return <PlanningShell title="پروژه‌ها و جست‌وجو"><p>کارها را براساس پروژه و مرحله دنبال کن.</p><div className="kp-grid"><Field label="پروژه"><select value={selected} onChange={e=>onSelectProject(e.target.value)}><option value="">همهٔ کارها / پروژهٔ جدید</option>{state.projects.filter(p=>includeArchived||!p.archived||p.id===selected).map(p=><option key={p.id} value={p.id}>{projectLabel(p)}</option>)}</select></Field><label><input type="checkbox" checked={includeArchived} onChange={e=>setIncludeArchived(e.target.checked)}/> نمایش بایگانی</label></div>
 {!parent && !project?.archived && <div className="kp-actions">
   <button type="button" aria-expanded={addingSubproject} aria-controls={addingSubproject ? subprojectFormId : undefined}
     onClick={() => {
       setSubprojectParentId(project?.id ?? (eligibleParents.length === 1 ? eligibleParents[0].id : ''));
       setAddingSubproject(open => !open);
     }}>
     افزودن زیرپروژه
   </button>
 </div>}
 {addingSubproject && !parent && !project?.archived && (
   eligibleParents.length ? <form id={subprojectFormId} className="kp-card" onSubmit={createSubproject}>
     <div className="kp-grid">
       <Field label="پروژهٔ مادر">
         <select required value={subprojectParent?.id ?? ''} onChange={event => setSubprojectParentId(event.target.value)}>
           <option value="">پروژهٔ مادر را انتخاب کن</option>
           {eligibleParents.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
         </select>
       </Field>
       <Field label="نام زیرپروژه">
         <input required value={subprojectTitle} onChange={event => setSubprojectTitle(event.target.value)} />
       </Field>
     </div>
     <div className="kp-actions">
       <button disabled={!subprojectParent || !subprojectTitle.trim()}>ساخت زیرپروژه</button>
       <button type="button" onClick={() => setAddingSubproject(false)}>انصراف</button>
     </div>
   </form> : <p id={subprojectFormId} role="status">اول از فرم پایین یک پروژهٔ اصلی بساز، بعد برایش زیرپروژه اضافه کن.</p>
 )}
 {parent && <div className="kp-actions">
   <button type="button" onClick={() => onSelectProject(parent.id)}>بازگشت به پروژهٔ مادر</button>
   <span>{parent.title}</span>
 </div>}
 <form className="kp-card" onSubmit={create}><div className="kp-grid"><Field label={parent ? 'نام زیرپروژه' : 'نام پروژه'}><input required value={title} onChange={e=>setTitle(e.target.value)}/></Field><Field label="توضیح"><input value={description} onChange={e=>setDescription(e.target.value)}/></Field></div><div className="kp-actions"><button disabled={!title.trim()}>{parent ? 'ذخیرهٔ زیرپروژه' : project ? 'ذخیرهٔ پروژه' : 'ساخت پروژه'}</button>{project&&<button type="button" onClick={()=>void change(s=>{s.projects.find(p=>p.id===selected)!.archived=!project.archived;})}>{project.archived?'بازگرداندن پروژه':'بایگانی پروژه'}</button>}</div></form>
 {project&&<div className="kp-card"><h3>{parent ? 'پیشرفت زیرپروژه' : 'پیشرفت کل پروژه'}</h3><Progress tasks={progressTasks}/><small>{subprojects.length ? 'کارهای پروژه و زیرپروژه‌ها با هم محاسبه می‌شوند. هر کار بایگانی‌نشده یک بار شمرده می‌شود.' : 'کارهای انجام‌شده ÷ کل کارهای بایگانی‌نشده؛ هر کار اصلی یک بار شمرده می‌شود.'}</small><Field label="قدم بعدی"><select value={project.nextTaskId??''} onChange={e=>void change(s=>{s.projects.find(p=>p.id===selected)!.nextTaskId=e.target.value;})}><option value="">انتخاب نشده</option>{own.filter(t=>!t.completed&&t.status!=='archived').map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></Field><details><summary>مدیریت مرحله‌ها</summary><form className="kp-actions" onSubmit={async e=>{e.preventDefault();if(stageTitle.trim()&&await change(s=>{s.projects.find(p=>p.id===selected)!.stages.push({id:uid(),title:stageTitle.trim()});}))setStageTitle('');}}><Field label="مرحلهٔ جدید"><input required value={stageTitle} onChange={e=>setStageTitle(e.target.value)}/></Field><button>افزودن مرحله</button></form>{project.stages.map((stage,index)=><StageEditor key={stage.id} project={project} stage={stage} index={index} tasks={own.filter(t=>t.planning?.stageId===stage.id)} busy={saving} onMove={direction=>void change(s=>{const a=s.projects.find(p=>p.id===selected)!.stages;[a[index],a[index+direction]]=[a[index+direction],a[index]];})} onRename={name=>change(s=>{s.projects.find(p=>p.id===selected)!.stages.find(x=>x.id===stage.id)!.title=name;})} onRemove={destination=>removeStage(stage.id,destination)}/>)}</details></div>}
 {project && !parent && <section className="kp-card" aria-label="زیرپروژه‌ها">
   <h3>زیرپروژه‌ها</h3>
   {subprojects.filter(child => includeArchived || !child.archived).map(child => (
     <div className="kp-card" key={child.id}>
       <button className="kp-link" type="button" onClick={() => onSelectProject(child.id)}>
         {child.title}{child.archived ? ' (بایگانی)' : ''}
       </button>
       <Progress tasks={tasksByProject.get(child.id) ?? []} />
     </div>
   ))}
   {!subprojects.length && <p>هنوز زیرپروژه‌ای برای این پروژه ثبت نشده است.</p>}
 </section>}
 <div className="kp-grid"><Field label="جست‌وجوی کار یا پروژه"><input type="search" value={query} onChange={e=>setQuery(e.target.value)}/></Field><Field label="وضعیت"><select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">همه</option><option value="open">انجام‌نشده</option><option value="done">انجام‌شده</option><option value="archived">بایگانی</option></select></Field>{project&&<Field label="فیلتر مرحله"><select value={stageFilter} onChange={e=>setStageFilter(e.target.value)}><option value="all">همهٔ مرحله‌ها</option><option value="__none">بدون مرحله</option>{project.stages.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></Field>}<Field label="موعد تا تاریخ (میلادی)"><input type="date" value={due} onChange={e=>setDue(e.target.value)}/></Field></div><button onClick={() => onAdd(selected)}>کار جدید</button>{!filtered.length&&<p>کاری با این فیلتر پیدا نشد.</p>}{groups?groups.filter(g=>stageFilter==='all'||g.id===stageFilter).map(g=><section key={g.id} aria-label={`کارهای مرحله ${g.title}`}><h3>{g.title}</h3><Progress tasks={own.filter(t=>g.id==='__none'?!t.planning?.stageId||!knownStages.has(t.planning.stageId):t.planning?.stageId===g.id)}/>{g.tasks.map(renderTask)}</section>):filtered.map(renderTask)}
 <section className="kp-card" id="project-templates"><h3>قالب‌ها و کپی کار</h3><Field label="تاریخ کارهای جدید (میلادی)"><input type="date" required value={templateDate} onChange={e=>setTemplateDate(e.target.value)}/></Field><div className="kp-actions">{[...builtins,...state.templates].map(t=><button key={t.id} onClick={()=>setTemplate({...structuredClone(t),tasks:t.tasks.map((x,i)=>({...x,id:x.id??`${t.id}:item:${i}`}))})}>{t.title}</button>)}</div><form className="kp-actions" onSubmit={async e=>{e.preventDefault();if(templateName.trim()&&filtered.length&&await change(s=>{s.templates.push({id:uid(),title:templateName.trim(),tasks:filtered.map(t=>({id:uid(),title:t.title,description:t.description,duration:t.duration,priority:t.priority,category:t.category,workType:t.planning?.workType,units:t.planning?.units,unitName:t.planning?.unitName,subtasks:t.subtasks?.map(x=>({...x,completed:false}))}))});}))setTemplateName('');}}><Field label="نام قالب از کارهای فهرست فعلی"><input required value={templateName} onChange={e=>setTemplateName(e.target.value)}/></Field><button disabled={!filtered.length}>ذخیرهٔ قالب</button></form>
 {template&&<div className="kp-card"><h4>پیش‌نمایش قابل ویرایش</h4><Field label="عنوان قالب"><input value={template.title} onChange={e=>setTemplate({...template,title:e.target.value})}/></Field>{template.tasks.map((t,i)=><div className="kp-card kp-grid" key={t.id??i}><Field label={`کار ${i+1}`}><input value={t.title} onChange={e=>setTemplate({...template,tasks:template.tasks.map((x,j)=>i===j?{...x,title:e.target.value}:x)})}/></Field><Field label="نوع مشخص کار"><input placeholder="مثلاً مرور واژگان" value={t.workType??''} onChange={e=>setTemplate({...template,tasks:template.tasks.map((x,j)=>i===j?{...x,workType:e.target.value}:x)})}/></Field><Field label="مدت (دقیقه)"><input type="number" min="1" value={t.duration} onChange={e=>setTemplate({...template,tasks:template.tasks.map((x,j)=>i===j?{...x,duration:Number(e.target.value)}:x)})}/></Field></div>)}<p>هر آیتم قالب هویت جدا دارد؛ وضعیت انجام، زمان واقعی و سابقهٔ تایمر کپی نمی‌شود.</p>{state.templates.some(t=>t.id===template.id)&&<div className="kp-actions"><button disabled={!template.title.trim()||template.tasks.some(t=>!t.title.trim()||!(t.duration>0))} onClick={async()=>{if(await change(s=>{s.templates=s.templates.map(t=>t.id===template.id?structuredClone(template):t);}))setMessage('قالب ویرایش شد.');}}>ذخیرهٔ تغییرات قالب</button><button onClick={()=>setRemoveTemplate(template.id)}>حذف قالب</button>{removeTemplate===template.id&&<><p>فقط قالب حذف می‌شود و کارهای ساخته‌شده حفظ می‌شوند.</p><button onClick={async()=>{if(await change(s=>{s.templates=s.templates.filter(t=>t.id!==template.id);})){setTemplate(null);setRemoveTemplate('');}}}>تأیید حذف قالب</button></>}</div>}<div className="kp-actions"><button disabled={saving||!templateDate||!template.title.trim()||template.tasks.some(t=>!t.title.trim()||!(t.duration>0))} onClick={()=>void useTemplate()}>تأیید ساخت {template.tasks.length} کار</button><button onClick={()=>setTemplate(null)}>انصراف</button></div></div>}</section><p role="status">{message}</p></PlanningShell>;
}
