import { MongoClient, Db } from "mongodb";

const uri = process.env.MONGO_URI!;

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

let promise: Promise<MongoClient>;

if (process.env.NODE_ENV === "development") {
  if (!global._mongoClientPromise) {
    global._mongoClientPromise = new MongoClient(uri).connect();
  }
  promise = global._mongoClientPromise;
} else {
  promise = new MongoClient(uri).connect();
}

export async function getDb(): Promise<Db> {
  const client = await promise;
  return client.db("magma");
}
