import { UserDTO } from './user.dto.js';

export interface LoginDTO {
  email: string;
  password: string;
}

export interface RegisterDTO {
  email: string;
  password: string;
  displayName?: string;
}

export interface AuthResponseDTO {
  token: string;
  user: UserDTO;
}
