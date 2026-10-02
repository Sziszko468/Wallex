import type { DeepStrings } from "../../types";
import type { errors as en } from "../en/errors";

export const errors: DeepStrings<typeof en> = {
  network: "Hálózati hiba – ellenőrizd a kapcsolatot, és próbáld újra.",
  generic: "Valami hiba történt. Kérjük, próbáld újra.",
};
