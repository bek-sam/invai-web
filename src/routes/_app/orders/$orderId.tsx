import { Button } from "@invai/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OrderDetail } from "../../../features/orders/order-detail";

export const Route = createFileRoute("/_app/orders/$orderId")({
  component: OrderPage,
});

function OrderPage() {
  const { t } = useTranslation();
  const { orderId } = Route.useParams();
  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link to="/orders">
          <ArrowLeft />
          {t("nav.orders")}
        </Link>
      </Button>
      <OrderDetail orderId={orderId} />
    </div>
  );
}
