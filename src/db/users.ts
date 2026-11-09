import { db } from './index.ts';
import { users, establishments } from './schema.ts';
import { eq } from 'drizzle-orm';

export async function getOrCreateUser(uid: string, email: string, displayName?: string) {
  try {
    let [est] = await db.select().from(establishments).limit(1);
    if (!est) {
      [est] = await db
        .insert(establishments)
        .values({
          code: 'EST-001',
          name: 'Restaurante & Brasserie Mesa Viva Ltda',
          tradeName: 'Mesa Viva Brasserie [DEMO]',
          cnpj: '12.345.678/0001-90',
          address: 'Av. Paulista, 1450 — Bela Vista, São Paulo - SP',
          requireWaiterConfirmation: false,
          serviceFeePercent: 10,
          allowPartialPayments: true,
          allowBillSplit: true,
          allowTableMerge: true,
          sessionTtlMinutes: 240,
          maxAuthAttempts: 5,
          operationMode: 'ONLINE_SYNCED',
        })
        .returning();
    }

    const usernameFromEmail = email.split('@')[0] + '_' + uid.slice(0, 5);
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        username: usernameFromEmail,
        name: displayName || email.split('@')[0],
        role: 'ADMIN',
        stationCode: 'COZINHA',
        pinCode: '1234',
        active: true,
        establishmentId: est.id,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed in getOrCreateUser:', error);
    throw new Error('Falha ao sincronizar usuário no banco de dados.', { cause: error });
  }
}

export async function getAllStaffUsers() {
  try {
    return await db.select().from(users);
  } catch (error) {
    console.error('Database query failed in getAllStaffUsers:', error);
    throw new Error('Falha ao consultar usuários.', { cause: error });
  }
}
