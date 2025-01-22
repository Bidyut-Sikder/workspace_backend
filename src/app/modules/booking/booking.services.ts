import httpStatus from "http-status";
import AppError from "../../errors/AppError";

import { UserModel } from "../auth/auth.model";
import { RoomModel } from "../room/room.model";
import { SlotModal } from "../slots/slot.model";
import { TBooking } from "./booking.interfaces";
import { BookingModel } from "./booking.model";
import { aggreGationPipeline } from "./booking.aggregation";
import { ObjectId } from "mongodb";

const createBookingService = async (payload: TBooking) => {
  const { date, slots, room, user } = payload;
  //  slots data = ["64ae1234ef56", "64ae5678cd34", "64ae7890ab12"];
  // room is the room id
  // user is the user id
  // slots are the timeslots for the room to be booked
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (!room) {
    throw new AppError(httpStatus.NOT_FOUND, "Room not found");
  }

  const userRecord = await UserModel.findById(user);

  if (!userRecord) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found in database");
  }

  const roomRecord = await RoomModel.findById(room);

  if (!roomRecord) {
    throw new AppError(httpStatus.NOT_FOUND, "Room not found in database");
  }

  const slotRecords = await SlotModal.find({ _id: { $in: slots } });
  //["64ae1234ef56", "64ae5678cd34", "64ae7890ab12"] are the slots aviailable in the database or not
  if (slotRecords.length !== slots.length) {
    // if they are not available in the database
    throw new AppError(httpStatus.NOT_FOUND, "Slots not found in the database");
  }

  //if slots created are not related to  the roomid
  const invalidSlots = slotRecords.filter((slot) => !slot.room.equals(room));
  if (invalidSlots.length > 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Slots do not belong to this specified room"
    );
  }

  // console.log(slotRecords)

  slotRecords.forEach(async (slot) => {
    slot.isBooked = true;
    await SlotModal.findByIdAndUpdate(
      { _id: slot._id },
      { $set: { isBooked: true } }
    );
  });

  const totalAmount = roomRecord.pricePerSlot * slotRecords.length;

  const booking = {
    date,
    slots: slotRecords,
    room: roomRecord,
    user: userRecord,
    totalAmount,
  };

  const createdBooking = await BookingModel.create(booking);
  const bookingId = createdBooking._id;

  const transformedOutput = await aggreGationPipeline(bookingId);
  return transformedOutput;
};

const getAdminAllBookingsService = async () => {
  const result = await BookingModel.find({ isDeleted: { $ne: true } });
  // return result
  const transformedOutput = await Promise.all(
    result.map(async (booking) => {
      const allBookings = await aggreGationPipeline(booking._id);
      return allBookings;
    })
  );

  return transformedOutput;
};
const getPaymentCompleteBookingsService = async () => {
  const result = await BookingModel.find({
    isDeleted: { $ne: true },
    paymentStatus: "paid",
  });
  const transformedOutput = await Promise.all(
    result.map(async (booking) => {
      const allBookings = await aggreGationPipeline(booking._id);
      return allBookings;
    })
  );
  return transformedOutput;
};

const adminUpdateBookingService = async (
  id: string,
  payload: Partial<TBooking>
) => {
  const result = await BookingModel.findByIdAndUpdate(id, payload, {
    new: true,
  });

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, "Booking not Found");
  }
  return result;
};

const confirmOrRejectBookingStatusService = async (
  id: string,
  status: string
) => {
  const validStatuses = ["confirmed", "unconfirmed"];
  if (!validStatuses.includes(status)) {
    return {
      success: false,
      message: "Invalid status. Must be 'confirmed' or 'unconfirmed'",
    };
  }

  // Update the booking status
  const booking = await BookingModel.findByIdAndUpdate(
    id,
    { isConfirmed: status },
    { new: true, runValidators: true }
  );

  if (!booking) {
    return { success: false, message: "Booking not found" };
  }
  const bookingPopulated = await aggreGationPipeline(new ObjectId(id));

  return {
    success: true,
    message: `Booking ${status} successfully`,
    booking: bookingPopulated,
  };
};

const deleteBookingService = async (id: string) => {
  const result = await BookingModel.findByIdAndUpdate(
    { _id: id },
    { isDeleted: true },
    { new: true }
  ).select("-paymentStatus -__v");

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, "Booking not Found");
  }
  return result;
};

export const BookingService = {
  createBookingService,
  getAdminAllBookingsService,
  getPaymentCompleteBookingsService,
  adminUpdateBookingService,
  confirmOrRejectBookingStatusService,
  deleteBookingService,
  // getUserBookingsFromDB,
};
