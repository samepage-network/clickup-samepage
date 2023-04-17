import createAPIGatewayHandler from "samepage/backend/createAPIGatewayProxyHandler";
import { zOauthRequest, zOauthResponse } from "samepage/internal/types";
import { z } from "zod";
import axios from "axios";
import { apiGet } from "samepage/internal/apiClient";

const logic = async (
  args: z.infer<typeof zOauthRequest>
): Promise<z.infer<typeof zOauthResponse>> => {
  const { data } = await axios
    .post<{ access_token: string }>(
      `https://api.clickup.com/api/v2/oauth/token`,
      {
        code: args.code,
        redirect_uri:
          process.env.NODE_ENV === "production"
            ? "https://samepage.network/oauth/clickup"
            : "https://samepage.ngrok.io/oauth/clickup",
        client_id: process.env.OAUTH_CLIENT_ID,
        client_secret: process.env.OAUTH_CLIENT_SECRET,
      },
      {
        headers: {
          Accept: "application/json",
        },
      }
    )
    .catch((e) =>
      Promise.reject(
        new Error(`Failed to get access token: ${e.response.data}`)
      )
    );
  const { access_token } = data;
  const { teams } = await apiGet<{ teams: { id: string; name: string }[] }>({
    authorization: access_token,
    domain: "https://api.clickup.com/api/v2",
    path: "team",
  });
  return {
    accessToken: access_token,
    workspace: teams[0].name,
  };
};

export default createAPIGatewayHandler(logic);
