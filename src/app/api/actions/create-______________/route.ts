import {
  ActionPostResponse,
  createPostResponse,
  ActionGetResponse,
  ActionPostRequest,
  createActionHeaders,
  ActionError,
  LinkedAction,
  ActionParameterSelectable,
} from "@solana/actions";
import * as web3 from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import { StatusCodes } from "http-status-codes";

import { initWeb3 } from "@/common/helper/helper";
import {
  CLUSTER_TYPES,
  ICreateTransaction,
  VERIFIED_CURRENCY,
} from "@/common/types";
import { ONCHAIN_CONFIG } from "@/common/helper/cluster.helper";
import { getRequestParam, validateParameters } from "@/common/helper/getParams";
import { GenericError } from "@/common/helper/error";
import logger from "@/common/logger";
import { jsonResponse } from "@/common/helper/responseMaker";
import { calculateTimeRange } from "@/common/helper/parseRelativeTime";
import { createTransaction } from "@/common/helper/transaction.helper";
import { checkBalanceAndGenerateOnrampLink } from "@/common/helper/insufficient-balance.helper";

// create the standard headers for this route (including CORS)
const headers = createActionHeaders();

export const GET = async (req: Request) => {
  try {
    logger.info("GET request received");

    /////////////////////////////////////
    /////////Extract Params//////////////
    /////////////////////////////////////

    const requestUrl = new URL(req.url);
    const clusterurl = getRequestParam<CLUSTER_TYPES>(
      requestUrl,
      "clusterurl",
      false,
    );

    const clusterOptions: ActionParameterSelectable<"radio">[] = clusterurl
      ? []
      : [
          {
            name: "clusterurl",
            label: "Select Cluster",
            type: "radio",
            required: true,
            options: [
              {
                label: "Devnet",
                value: CLUSTER_TYPES.DEVNET,
                selected: true,
              },
              {
                label: "Mainnet",
                value: CLUSTER_TYPES.MAINNET,
              },
            ],
          },
        ];

    const href = clusterurl
      ? `/api/actions/create-challenge?clusterurl=${clusterurl}&name={name}&token={token}&wager={wager}&startTime={startTime}&duration={duration}`
      : `/api/actions/create-challenge?clusterurl={clusterurl}&name={name}&token={token}&wager={wager}&startTime={startTime}&duration={duration}`;

    const actions: LinkedAction[] = [
      {
        type: "transaction",
        label: "Create a ___________________", // TODO: edit text here
        href,
        parameters: [
          ...clusterOptions,
          {
            name: "name",
            label: "Name your challenge",
            required: true,
          },
          {
            name: "token",
            label: "Choose token",
            type: "radio",
            required: true,
            options: [
              {
                label: VERIFIED_CURRENCY.SOL,
                value: VERIFIED_CURRENCY.SOL,
                selected: true,
              },
              {
                label: VERIFIED_CURRENCY.USDC,
                value: VERIFIED_CURRENCY.USDC,
              },
              {
                label: VERIFIED_CURRENCY.BONK,
                value: VERIFIED_CURRENCY.BONK,
              },
            ],
          },
          {
            name: "wager",
            label: "Set wager amount",
            required: true,
          },
          {
            name: "startTime",
            label: "Starting time of the challenge. eg: 5m, 1h, 2d...",
            required: true,
          },
          {
            name: "duration",
            label: "Duration of the challenge. eg: 5m, 1h, 2d...",
            required: true,
          },
        ],
      },
    ];

    const basicUrl =
      process.env.IS_PROD === "prod"
        ? "https://join.catoff.xyz" // TODO: edit url here
        : new URL(req.url).origin;

    const icons = {
      name: new URL("/name.png", basicUrl).toString(), // TODO: edit link here
    };

    let payload: ActionGetResponse;

    payload = {
      title: ``, // TODO: edit text here
      icon: icons.name,
      type: "action",
      description: `- 
      
---

### Need funds in your wallet?
To add money to your wallet using **UPI**, copy your wallet address and click the link below:
➡️ [Add Funds Here](https://game.catoff.xyz/onramp)
`, // TODO: edit text here
      label: "Create",
      links: { actions },
    };
    logger.info("Payload constructed successfully: %o", payload);
    return jsonResponse(payload, StatusCodes.OK, headers);
  } catch (err) {
    logger.error("An error occurred in GET handler: %s", err);
    let actionError: ActionError = { message: "An unknown error occurred" };
    if (typeof err === "string") actionError.message = err;
    return jsonResponse(actionError, StatusCodes.BAD_REQUEST, headers);
  }
};

// DO NOT FORGET TO INCLUDE THE `OPTIONS` HTTP METHOD
// THIS WILL ENSURE CORS WORKS FOR BLINKS
export const OPTIONS = async () => Response.json(null, { headers });

export const POST = async (req: Request) => {
  try {
    /////////////////////////////////////
    /////////Extract Params//////////////
    /////////////////////////////////////

    const requestUrl = new URL(req.url);
    logger.info("POST request received for ___________________");

    // Validate and retrieve parameters with logging
    const clusterurl = getRequestParam<CLUSTER_TYPES>(
      requestUrl,
      "clusterurl",
      false,
      Object.values(CLUSTER_TYPES),
      CLUSTER_TYPES.DEVNET,
    );
    const name = getRequestParam<string>(requestUrl, "name", true);
    const token = getRequestParam<VERIFIED_CURRENCY>(
      requestUrl,
      "token",
      true,
      Object.values(VERIFIED_CURRENCY),
      VERIFIED_CURRENCY.SOL,
    );
    const wager = getRequestParam<number>(requestUrl, "wager", true);
    validateParameters("wager", wager > 0, "Wager must be greater than zero");

    const startTimeStr = getRequestParam<string>(requestUrl, "startTime", true);
    const durationStr = getRequestParam<string>(requestUrl, "duration", true);
    const { startDate, endDate } = calculateTimeRange(startTimeStr, durationStr);

    /////////////////////////////////////
    /////////Extract Account/////////////
    /////////////////////////////////////

    // Retrieve request body and validate account
    const body: ActionPostRequest = await req.json();
    let account: PublicKey;
    try {
      account = new PublicKey(body.account);
      logger.info(`Account PublicKey validated: ${account.toString()}`);
    } catch (err) {
      logger.error(`Invalid account public key: ${body.account}`);
      throw new GenericError("Invalid account public key", StatusCodes.BAD_REQUEST);
    }

    /////////////////////////////////////
    ///////////Parse Phase///////////////
    /////////////////////////////////////

    /////////////////////////////////////
    /////////Transaction Phase///////////
    /////////////////////////////////////

    const { connection } = await initWeb3(clusterurl);
    await checkBalanceAndGenerateOnrampLink(connection, account, wager);

    const recipientAddr = ONCHAIN_CONFIG[clusterurl].treasuryWallet;
    const recipientPublicKey = new PublicKey(recipientAddr);
    const createTx: ICreateTransaction = {
      accountPublicKey: account,
      recipientPublicKey,
      currency: VERIFIED_CURRENCY.SOL,
      amount: 0.000000001,
      connection,
      cluster: clusterurl,
    };
    const tx = await createTransaction(createTx);

    const { blockhash } = await connection.getLatestBlockhash();
    logger.info("Blockhash: %s", blockhash);

    // Create the transaction and set the user as the payer
    const transaction = new web3.Transaction({
      recentBlockhash: blockhash,
      feePayer: account, // User's wallet pays the fee
    }).add(...tx);

    const href = `/api/actions/___________________/next-action?clusterurl=${clusterurl}&name=${name}&token=${token}&wager=${wager}&startDate=${startDate}&endDate=${endDate}`; // TODO: edit next action link here
    logger.info(`Sending next action for create challenge blinks at: ${href}`);

    // Create response payload
    const payload: ActionPostResponse = await createPostResponse({
      fields: {
        type: "transaction",
        transaction,
        message: "Create Catoff ___________________", // TODO: edit text here
        links: {
          next: {
            type: "post",
            href,
          },
        },
      },
    });
    logger.info("Response payload created successfully");

    return jsonResponse(payload, StatusCodes.OK, headers);
  } catch (err) {
    logger.error("An error occurred in POST handler:", err);
    let actionError: ActionError = { message: "An unknown error occurred" };
    if (typeof err === "string") actionError.message = err;
    else if (err instanceof GenericError) actionError.message = err.message;

    return jsonResponse(actionError, StatusCodes.BAD_REQUEST, headers);
  }
};
