import mongoose, { Document, Schema, FlattenMaps } from "mongoose";
import bcrypt from "bcrypt";

export interface IUser extends Document {
  email: string;
  fullName: string;
  username?: string;
  passwordHash: string;
  refreshTokenHash?: string;
  emailVerified: boolean;
  emailVerifiedAt?: Date;
  termsAcceptedAt?: Date;
  bvnVerified: boolean;
  bvnVerifiedAt?: Date;
  bvnHash?: string;
  phoneNumber?: string;
  phoneVerified: boolean;
  createdAt: Date;
  lastLoginAt?: Date;
  isActive: boolean;

  comparePassword(candidate: string): Promise<boolean>;
  toJSON(): FlattenMaps<this> & { _id: mongoose.Types.ObjectId; __v: number };
}

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email format"],
    },
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
      maxlength: 100,
    },
    username: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    refreshTokenHash: {
      type: String,
      select: false,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerifiedAt: { type: Date },
    termsAcceptedAt: { type: Date },
    bvnVerified: {
      type: Boolean,
      default: false,
    },
    bvnVerifiedAt: { type: Date },
    bvnHash: {
      type: String,
      select: false,
      sparse: true,
      unique: true,
    },
    phoneNumber: {
      type: String,
      trim: true,
    },
    phoneVerified: {
      type: Boolean,
      default: false,
    },
    lastLoginAt: { type: Date },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

UserSchema.pre("save", async function (this: IUser) {
  if (!this.isModified("passwordHash")) return;
  const salt = await bcrypt.genSalt(12);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
});

UserSchema.methods.comparePassword = async function (
  candidate: string,
): Promise<boolean> {
  return bcrypt.compare(candidate, this.passwordHash);
};

UserSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.refreshTokenHash;
  delete obj.bvnHash;
  return obj;
};

export default mongoose.model<IUser>("User", UserSchema);