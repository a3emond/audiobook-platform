import { IdDTO, TimestampDTO } from "./common.dto.js";


export interface UserDTO extends IdDTO, TimestampDTO {
  email: string;
  role: "admin" | "user";
  profile: {
    displayName?: string | null;
    preferredLocale: "fr" | "en";
  };
}
