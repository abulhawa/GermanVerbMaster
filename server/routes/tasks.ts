import { Router } from "express";
import { createListTasksHandler, createSubmitTaskHandler } from "./tasks/handlers.js";

export function createTaskRouter(): Router {
  const router = Router();

  router.get("/tasks", createListTasksHandler());
  router.post("/submission", createSubmitTaskHandler());

  return router;
}
