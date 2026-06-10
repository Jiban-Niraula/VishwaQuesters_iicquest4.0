import { http } from "./http.js";

export const publicApi = {
  pricing() {
    return http.get("/public/pricing").then((res) => res.data);
  },
};
