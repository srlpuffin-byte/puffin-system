import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (req, res) => {
  const whatsappKeys = Object.keys(process.env).filter(k => k.toUpperCase().includes("WHATSAPP"));
  res.json({ 
    status: "ok",
    hasCloudinary: !!process.env.CLOUDINARY_URL,
    whatsapp: {
      hasToken: !!process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_ACCESS_TOKEN !== "TODO_ACCESS_TOKEN",
      hasTokenAlt: !!process.env.WHATSAPP_TOKEN,
      phoneId: process.env.WHATSAPP_PHONE_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || null,
      foundEnvKeys: whatsappKeys,
    }
  });
});

export default router;
