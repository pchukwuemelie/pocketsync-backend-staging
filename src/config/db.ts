import mongoose from "mongoose";

const connectDB = async (): Promise<void> => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI as string);
    console.log(
      `Our MongoDB database is connected successfully: ${conn.connection.host}`,
    );
  } catch (error) {
    console.error("There is a MongoDB connection error:", error);
    process.exit(1);
  }
};

export default connectDB;
