import { prisma } from '@genie/db';
import type { gifts as G } from '@genie/contracts';
import { notFound } from '../../lib/errors';

type AddCard = G.AddCardBody;

export async function listCards(userId: string) {
  const cards = await prisma.savedCard.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
  return cards.map((c) => ({
    id: c.id,
    last4: c.last4,
    brand: c.brand,
    expMonth: c.expMonth,
    expYear: c.expYear,
    isDefault: c.isDefault,
  }));
}

export async function addCard(userId: string, input: AddCard) {
  const card = await prisma.$transaction(async (tx) => {
    if (input.makeDefault) {
      await tx.savedCard.updateMany({ where: { userId }, data: { isDefault: false } });
    }
    const count = await tx.savedCard.count({ where: { userId } });
    return tx.savedCard.upsert({
      where: { userId_providerToken: { userId, providerToken: input.providerToken } },
      create: {
        userId,
        providerToken: input.providerToken,
        last4: input.last4,
        brand: input.brand,
        expMonth: input.expMonth,
        expYear: input.expYear,
        isDefault: input.makeDefault || count === 0,
      },
      update: {
        last4: input.last4,
        brand: input.brand,
        expMonth: input.expMonth,
        expYear: input.expYear,
        isDefault: input.makeDefault ? true : undefined,
      },
    });
  });
  return listCards(userId).then((cards) => cards.find((c) => c.id === card.id)!);
}

/** Permanent removal of card details (US0019). */
export async function removeCard(userId: string, cardId: string) {
  const card = await prisma.savedCard.findFirst({ where: { id: cardId, userId } });
  if (!card) throw notFound('Card not found.');
  await prisma.savedCard.delete({ where: { id: cardId } });
  if (card.isDefault) {
    const next = await prisma.savedCard.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
    if (next) await prisma.savedCard.update({ where: { id: next.id }, data: { isDefault: true } });
  }
}
