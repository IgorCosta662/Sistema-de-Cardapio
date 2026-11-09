// ============================================================================
// MESA VIVA — C# / .NET 8 APPLICATION LAYER (Use Cases, DTOs & Validators)
// Casos de Uso Transacionais: Abertura de Mesa, Pedidos Idempotentes, Caixa e Sync
// ============================================================================

using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MesaViva.Domain;

namespace MesaViva.Application
{
    public record OpenTableRequestDto(Guid TableId, int GuestCount, Guid WaiterUserId, string WaiterName);
    public record OpenTableResultDto(Guid SessionId, string AccessCode, string AccessPassword, string QrToken, DateTimeOffset ExpiresAt);

    public record OrderItemInputDto(Guid ProductId, int Quantity, List<string> SelectedOptionIds, string Notes);
    public record CreateOrderRequestDto(
        Guid SessionId,
        Guid TableId,
        string Origin,
        string IdempotencyKey,
        string Priority,
        string Notes,
        List<OrderItemInputDto> Items
    );

    public interface IMesaVivaOrderService
    {
        Task<OpenTableResultDto> OpenTableSessionAsync(OpenTableRequestDto request, CancellationToken ct = default);
        Task<Order> CreateOrderIdempotentAsync(CreateOrderRequestDto request, CancellationToken ct = default);
        Task<TableSession> CloseTableSessionAsync(Guid sessionId, Guid cashierUserId, CancellationToken ct = default);
    }

    public sealed class CommercialCalculationService
    {
        /// <summary>
        /// Calcula o total da conta exclusivamente no servidor, ignorando qualquer valor enviado pelo cliente.
        /// </summary>
        public static (long SubtotalCents, long ServiceFeeCents, long TotalCents, long BalanceCents) CalculateAccountTotals(
            IEnumerable<OrderItem> nonCancelledItems,
            int serviceFeePercent,
            bool serviceFeeEnabled,
            long discountCents,
            long surchargeCents,
            long confirmedPaidCents)
        {
            var subtotal = nonCancelledItems
                .Where(i => i.Status != "CANCELLED")
                .Sum(i => i.LineTotalCents);

            var serviceFee = serviceFeeEnabled
                ? (long)Math.Round(subtotal * (serviceFeePercent / 100.0))
                : 0L;

            var total = Math.Max(0L, subtotal + serviceFee + surchargeCents - discountCents);
            var balance = Math.Max(0L, total - confirmedPaidCents);

            return (subtotal, serviceFee, total, balance);
        }
    }
}
