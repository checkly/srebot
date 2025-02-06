import { z } from "zod";

export const validString = z.string().min(1);
export const validStringList = z.array(validString).min(1);
export const validObject = z
  .object({})
  .catchall(z.any())
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "Object must have at least one property",
  });

export const validObjectList = z.array(validObject).min(1);
