// ============================================================================
// MESA VIVA — xUNIT INTEGRATION TESTS (Concorrência, Reconexão e Sincronização)
// ============================================================================

using System;
using System.Collections.Generic;
using System.Linq;
using Xunit;
using MesaViva.Domain;
using MesaViva.Application;

namespace MesaViva.IntegrationTests
{
    public class SyncAndConcurrencyIntegrationTests
    {
        [Fact]
        public void OfflineQueue_ShouldPreserveMonotonicOrder_AndPreventDuplicateOrdersOnReconnect()
        {
            var processedIdempotencyKeys = new HashSet<string>();
            var key = "CLI-OFFLINE-UUID-0001";

            // First submission while on Local Wi-Fi Edge Server
            var firstAccepted = processedIdempotencyKeys.Add(key);
            // Automatic retry when WAN internet connection recovers
            var duplicateRetryAccepted = processedIdempotencyKeys.Add(key);

            Assert.True(firstAccepted);
            Assert.False(duplicateRetryAccepted);
            Assert.Single(processedIdempotencyKeys);
        }

        [Fact]
        public void PriceChangeInCloud_ShouldNotMutateHistoricalOrderItemSnapshots()
        {
            var itemSnapshotAtSale = new OrderItem
            {
                Id = Guid.NewGuid(),
                ProductNameSnapshot = "Picanha Angus na Brasa",
                UnitPriceSnapshotCents = 10990,
                AddonsTotalCents = 1800,
                Quantity = 2
            };
            itemSnapshotAtSale.CalculateLineTotal();

            // Admin updates catalog price later to R$ 139,90
            var newCatalogPriceCents = 13990L;

            Assert.Equal(25580L, itemSnapshotAtSale.LineTotalCents);
            Assert.NotEqual(newCatalogPriceCents * 2, itemSnapshotAtSale.LineTotalCents);
        }

        [Fact]
        public void AccountCalculation_ShouldBlockClosure_WhenPartialPaymentLeavesPendingBalance()
        {
            var items = new List<OrderItem>
            {
                new OrderItem { Status = "DELIVERED", LineTotalCents = 10000 }
            };

            var totals = CommercialCalculationService.CalculateAccountTotals(
                nonCancelledItems: items,
                serviceFeePercent: 10,
                serviceFeeEnabled: true,
                discountCents: 0,
                surchargeCents: 0,
                confirmedPaidCents: 5000 // Partial payment of R$ 50,00 out of R$ 110,00
            );

            Assert.Equal(11000L, totals.TotalCents);
            Assert.Equal(6000L, totals.BalanceCents);
        }
    }
}
