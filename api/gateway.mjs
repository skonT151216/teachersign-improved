import { createSchoolGateway } from "../server/school-gateway.mjs";
const origins = [
  process.env.TEACHERSIGN_ORIGIN,
  process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
  process.env.VERCEL_PROJECT_PRODUCTION_URL &&
    `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
].filter(Boolean);
export default createSchoolGateway({
  secret: process.env.TEACHERSIGN_COOKIE_SECRET,
  origins,
});
