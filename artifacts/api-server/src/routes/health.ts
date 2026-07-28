import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (req, res) => {
  res.json({ 
    status: "ok",
    hasCloudinary: !!process.env.CLOUDINARY_URL 
  });
});

export default router;
