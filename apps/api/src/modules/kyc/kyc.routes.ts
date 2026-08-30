import { createRoute } from '@hono/zod-openapi';
import { kyc as K } from '@genie/contracts';
import { createRouter } from '../../lib/router';
import { badRequest } from '../../lib/errors';
import { commonErrorResponses, jsonResponse, z } from '../../lib/openapi';
import { requireAuth, requireVerifiedEmail } from '../../middleware/auth';
import { getMyKyc, kycRequirements, MAX_KYC_FILE_BYTES, submitLevel1 } from './kyc.service';

const router = createRouter();

router.use('*', requireAuth);
router.use('/level-1', requireVerifiedEmail);

const dataObj = z.object({ data: z.record(z.unknown()) });

// ── GET /kyc ──────────────────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['KYC'],
    summary: 'My identity-verification status',
    security: [{ bearerAuth: [] }],
    responses: { 200: jsonResponse('KYC status', dataObj), ...commonErrorResponses },
  }),
  async (c) => c.json({ data: await getMyKyc(c.get('user')!.id) }, 200),
);

// ── GET /kyc/requirements ─────────────────────────────────────────────
router.openapi(
  createRoute({
    method: 'get',
    path: '/requirements',
    tags: ['KYC'],
    summary: 'What Level 1 verification needs and unlocks',
    security: [{ bearerAuth: [] }],
    responses: { 200: jsonResponse('Requirements', dataObj), ...commonErrorResponses },
  }),
  async (c) => c.json({ data: kycRequirements() }, 200),
);

// ── POST /kyc/level-1  (multipart/form-data) ──────────────────────────
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

async function readImagePart(form: FormData, field: string) {
  const part = form.get(field);
  if (!(part instanceof File)) throw badRequest(`Missing file: ${field}.`);
  if (part.size === 0) throw badRequest(`${field} is empty.`);
  if (part.size > MAX_KYC_FILE_BYTES) throw badRequest(`${field} is larger than 8MB.`);
  const type = part.type || 'image/jpeg';
  if (!IMAGE_TYPES.has(type)) throw badRequest(`${field} must be a JPEG, PNG or WebP image.`);
  return { bytes: new Uint8Array(await part.arrayBuffer()), contentType: type };
}

router.post('/level-1', async (c) => {
  const form = await c.req.formData().catch(() => null);
  if (!form) throw badRequest('Send this as multipart/form-data.');

  const parsed = K.kycLevel1Fields.safeParse({
    idDocType: form.get('idDocType'),
    idDocNumber: form.get('idDocNumber') || undefined,
    bvn: form.get('bvn') || undefined,
  });
  if (!parsed.success) {
    throw badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  }

  const [selfie, idDoc] = await Promise.all([
    readImagePart(form, 'selfie'),
    readImagePart(form, 'idDoc'),
  ]);

  const result = await submitLevel1(c.get('user')!.id, parsed.data, { selfie, idDoc });
  return c.json({ data: result }, 201);
});

router.openAPIRegistry.registerPath({
  method: 'post',
  path: '/kyc/level-1',
  tags: ['KYC'],
  summary: 'Submit Level 1 verification (selfie + ID doc, multipart)',
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'multipart/form-data': {
          schema: z.object({
            selfie: z.string().openapi({ format: 'binary' }),
            idDoc: z.string().openapi({ format: 'binary' }),
            idDocType: K.idDocType,
            idDocNumber: z.string().optional(),
            bvn: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: { description: 'Submission received', content: { 'application/json': { schema: dataObj } } },
    400: { description: 'Validation or business-rule failure' },
  },
});

export default router;
