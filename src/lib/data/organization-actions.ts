'use server';
import { requireUser,safeAction } from './access';
import { getOrganization,saveOrganization,respondAttendance,markRulesRead,withdrawWaitlist } from '@/lib/repositories/organization';
import { manageMemberStatus } from '@/lib/repositories/exchanges';
export async function organizationAction(id:string) { return safeAction(async()=>getOrganization(id,(await requireUser()).id)); }
export async function saveOrganizationAction(id:string,input:{capacity:number;rules:string;revision:number}) { return safeAction(async()=>saveOrganization(id,(await requireUser()).id,input)); }
export async function attendanceAction(id:string,target:string,response:string) { return safeAction(async()=>respondAttendance(id,(await requireUser()).id,target,response)); }
export async function rulesReadAction(id:string,target:string,version:number) { return safeAction(async()=>markRulesRead(id,(await requireUser()).id,target,version)); }
export async function withdrawWaitlistAction(id:string) { return safeAction(async()=>withdrawWaitlist(id,(await requireUser()).id)); }
export async function promoteWaitlistAction(id:string,target:string) { return safeAction(async()=>manageMemberStatus(id,target,'approved',(await requireUser()).id)); }
