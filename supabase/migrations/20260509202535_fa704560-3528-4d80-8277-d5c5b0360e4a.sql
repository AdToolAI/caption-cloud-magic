create or replace function public.replace_composer_scene_with_children(
  p_parent_scene_id uuid,
  p_children jsonb,
  p_remove_parent boolean default true
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_parent_order int;
  v_owner uuid;
  v_caller uuid := auth.uid();
  v_insert_at int;
  v_shift int;
  v_new_ids uuid[] := '{}';
  v_new_id uuid;
  v_child jsonb;
  v_idx int := 0;
  v_tmp_base int := 1000000;
begin
  -- Load parent + project ownership
  select cs.project_id, cs.order_index, p.user_id
    into v_project_id, v_parent_order, v_owner
  from public.composer_scenes cs
  join public.composer_projects p on p.id = cs.project_id
  where cs.id = p_parent_scene_id;

  if v_project_id is null then
    raise exception 'parent_scene_not_found' using errcode = 'P0001';
  end if;

  if v_caller is null or v_caller <> v_owner then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_insert_at := case when p_remove_parent then v_parent_order else v_parent_order + 1 end;
  v_shift := jsonb_array_length(p_children) - case when p_remove_parent then 1 else 0 end;

  -- Step 1: shift tail scenes into a high temp range (avoid unique collisions)
  if v_shift <> 0 then
    update public.composer_scenes
       set order_index = order_index + v_tmp_base,
           updated_at = now()
     where project_id = v_project_id
       and order_index > v_parent_order;
  end if;

  -- Step 2: remove parent and its audio
  if p_remove_parent then
    delete from public.scene_audio_clips where scene_id = p_parent_scene_id;
    delete from public.composer_scenes where id = p_parent_scene_id;
  end if;

  -- Step 3: insert children at their final positions
  for v_child in select * from jsonb_array_elements(p_children)
  loop
    insert into public.composer_scenes (
      project_id,
      order_index,
      scene_type,
      duration_seconds,
      clip_source,
      clip_quality,
      clip_status,
      clip_url,
      with_audio,
      lip_sync_with_voiceover,
      ai_prompt,
      stock_keywords,
      upload_url,
      upload_type,
      reference_image_url,
      text_overlay,
      transition_type,
      transition_duration,
      director_modifiers,
      shot_director,
      prompt_slots,
      prompt_mode,
      prompt_slot_order,
      applied_style_preset_id,
      cinematic_preset_slug,
      dialog_script,
      dialog_voices,
      engine_override,
      character_shots
    ) values (
      v_project_id,
      v_insert_at + v_idx,
      coalesce(v_child->>'scene_type', 'custom'),
      coalesce((v_child->>'duration_seconds')::numeric, 5),
      coalesce(v_child->>'clip_source', 'stock'),
      coalesce(v_child->>'clip_quality', 'standard'),
      coalesce(v_child->>'clip_status', 'pending'),
      v_child->>'clip_url',
      coalesce((v_child->>'with_audio')::boolean, true),
      coalesce((v_child->>'lip_sync_with_voiceover')::boolean, false),
      v_child->>'ai_prompt',
      v_child->>'stock_keywords',
      v_child->>'upload_url',
      v_child->>'upload_type',
      v_child->>'reference_image_url',
      coalesce(v_child->'text_overlay', '{}'::jsonb),
      coalesce(v_child->>'transition_type', 'none'),
      coalesce((v_child->>'transition_duration')::numeric, 0),
      coalesce(v_child->'director_modifiers', '{}'::jsonb),
      coalesce(v_child->'shot_director', '{}'::jsonb),
      v_child->'prompt_slots',
      v_child->>'prompt_mode',
      case when v_child ? 'prompt_slot_order' and jsonb_typeof(v_child->'prompt_slot_order') = 'array'
           then array(select jsonb_array_elements_text(v_child->'prompt_slot_order'))
           else null end,
      nullif(v_child->>'applied_style_preset_id','')::uuid,
      v_child->>'cinematic_preset_slug',
      v_child->>'dialog_script',
      v_child->'dialog_voices',
      coalesce(v_child->>'engine_override', 'auto'),
      v_child->'character_shots'
    )
    returning id into v_new_id;

    v_new_ids := v_new_ids || v_new_id;
    v_idx := v_idx + 1;
  end loop;

  -- Step 4: move tail back to final position (=order_index - tmp_base + shift)
  if v_shift <> 0 then
    update public.composer_scenes
       set order_index = order_index - v_tmp_base + v_shift,
           updated_at = now()
     where project_id = v_project_id
       and order_index > v_tmp_base;
  end if;

  return v_new_ids;
end;
$$;

revoke all on function public.replace_composer_scene_with_children(uuid, jsonb, boolean) from public;
grant execute on function public.replace_composer_scene_with_children(uuid, jsonb, boolean) to authenticated;