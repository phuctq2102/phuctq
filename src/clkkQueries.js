import { supabase } from './supabase';

export const periodKey = row => `${row.ma_ch}|${row.ngay_moi}`;

export async function readClkkPeriods() {
  const { data: codes, error } = await supabase.rpc('v10_clkk_cua_hang');
  if (error) throw error;
  const schedules = [];
  for (let offset = 0; ; offset += 500) {
    let query = supabase.from('v10_clkk_lich').select('*').order('ngay_moi', { ascending: false }).order('ma_ch');
    if (codes.length) query = query.in('ma_ch', codes);
    const { data, error: scheduleError } = await query.range(offset, offset + 499);
    if (scheduleError) throw scheduleError;
    schedules.push(...data);
    if (data.length < 500) break;
  }
  return { codes, schedules };
}

export async function readClkkGroups(period) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.rpc('v10_clkk_mch3', { p_ma_ch: period.ma_ch, p_ngay_moi: period.ngay_moi })
      .order('thang').order('mch2').order('mch3').range(offset, offset + 499);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) break;
  }
  return rows;
}
