import { z } from 'zod';

export const receiptPresignSchema = z.object({
  group_id: z.string().uuid(),
  file_name: z.string().trim().min(1),
  content_type: z.string().trim().min(1),
});
